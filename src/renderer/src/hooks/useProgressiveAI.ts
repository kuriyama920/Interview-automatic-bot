/**
 * Progressive AI Generation フック
 *
 * 面接官の発言中にリアルタイムでAI回答を生成。
 * Layer 1: ローカルQ&Aキャッシュで即時マッチング（<1ms）
 * Layer 2: マッチなしの場合、AI生成（gpt-5-nano minimal streaming）
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Transcript } from '../types'
import { useQuestionCache, type QuestionMatch } from './useQuestionCache'
import { createLogger } from '../utils/logger'

const log = createLogger('useProgressiveAI')

const INTERIM_MIN_LENGTH = 3     // 最低3文字以上で生成開始（日本語は1文字=情報量大）
const INTERIM_DEBOUNCE_MS = 300  // 再生成のデバウンス間隔（reasoning_effort:'minimal'でTTFT短縮のため積極的に）
const FINAL_MIN_LENGTH = 3       // 確定テキストの最低文字数
const INTERIM_MAX_TOKENS = 400   // Interim用の短めトークン上限（短い回答スタイルに合わせて削減）
const FINAL_ACCUMULATE_MS = 350  // 同一話者のfinal transcriptを蓄積する待機時間（TTFT改善分を反映）

/** キャッシュ済みドキュメント + 会話履歴を結合 */
function buildContext(docContext: string | null, history: string): string | undefined {
  const parts = [docContext || '', history].filter(Boolean)
  return parts.length > 0 ? parts.join('\n\n') : undefined
}

interface UseProgressiveAIOptions {
  currentText: string | null
  currentSource: string | undefined
  audioSource: string
  transcripts: Transcript[]
  autoGenerateAI: boolean
  conversationHistory: string
  cachedDocumentContextRef: React.RefObject<string>
  generateStreamResponse: (text: string, context?: string, options?: GenerateOptions) => Promise<void>
  abortGeneration: () => void
}

export function useProgressiveAI({
  currentText,
  currentSource,
  audioSource,
  transcripts,
  autoGenerateAI,
  conversationHistory,
  cachedDocumentContextRef,
  generateStreamResponse,
  abortGeneration,
}: UseProgressiveAIOptions) {
  const { findMatch, findPartialMatch, refreshCache, clearCache } = useQuestionCache()
  const [cachedMatch, setCachedMatch] = useState<QuestionMatch | null>(null)
  const cachedMatchRef = useRef<QuestionMatch | null>(null)
  const conversationHistoryRef = useRef<string>('')
  conversationHistoryRef.current = conversationHistory

  const updateCachedMatch = useCallback((match: QuestionMatch | null) => {
    cachedMatchRef.current = match
    setCachedMatch(match)
  }, [])

  const lastGeneratedTextRef = useRef<string>('')
  const interimDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalAccumulateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTextRef = useRef<string | null>(null)
  currentTextRef.current = currentText
  const transcriptsRef = useRef<Transcript[]>([])
  transcriptsRef.current = transcripts
  const lastProcessedIndex = useRef<number>(-1)

  // Interim: 面接官発言で即座にマッチング→AI生成
  useEffect(() => {
    const shouldProcess =
      autoGenerateAI &&
      currentText &&
      currentText.trim().length >= INTERIM_MIN_LENGTH &&
      !(currentSource === 'mic' && audioSource === 'both')

    if (shouldProcess) {
      const trimmed = currentText.trim()

      // Layer 1: 想定質問キャッシュで即時マッチング
      const match = findMatch(trimmed)
      if (match) {
        log.info('[Interim] Instant Q&A match found', {
          query: trimmed.substring(0, 30),
          matched: match.question.substring(0, 30),
          similarity: match.similarity.toFixed(3),
        })
        abortGeneration()
        updateCachedMatch(match)
        lastGeneratedTextRef.current = trimmed
      } else {
        // マッチなし → キャッシュクリア（ref経由で依存ループを回避）
        if (cachedMatchRef.current) {
          updateCachedMatch(null)
        }

        // Layer 2: AI生成（初回は即座に、以降はデバウンスで）
        if (!lastGeneratedTextRef.current) {
          log.info('[Interim] Triggering AI generation (initial)', {
            text: trimmed,
            length: trimmed.length,
            source: currentSource,
          })
          lastGeneratedTextRef.current = trimmed
          generateStreamResponse(
            trimmed,
            buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
            { includeDocumentContext: false, maxTokens: INTERIM_MAX_TOKENS },
          )
        } else if (trimmed.length > lastGeneratedTextRef.current.length * 1.5) {
          // 2回目以降: テキストが50%以上長くなった場合、デバウンスで再生成
          if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current)
          interimDebounceRef.current = setTimeout(() => {
            // 最新のテキストを使用（stale closure回避）
            const latestText = currentTextRef.current?.trim() || ''
            if (latestText.length < INTERIM_MIN_LENGTH) return
            log.info('[Interim] Triggering AI re-generation (text grew)', {
              text: latestText,
              length: latestText.length,
              prevLength: lastGeneratedTextRef.current.length,
            })
            lastGeneratedTextRef.current = latestText
            generateStreamResponse(
              latestText,
              buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
              { includeDocumentContext: false, maxTokens: INTERIM_MAX_TOKENS },
            )
          }, INTERIM_DEBOUNCE_MS)
        }
      }
    }

    // 常にクリーンアップを返す（早期リターンでもペンディング中のタイマーをクリア）
    return () => {
      if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current)
    }
  }, [currentText, currentSource, audioSource, autoGenerateAI, generateStreamResponse, findMatch, abortGeneration, updateCachedMatch])

  // Final蓄積処理: デバウンス後に蓄積されたtranscriptをまとめて処理
  const processFinalTranscripts = useCallback(() => {
    const latest = transcriptsRef.current
    const allNew = latest.slice(lastProcessedIndex.current + 1)
    if (allNew.length === 0) return

    const filtered = audioSource === 'both'
      ? allNew.filter((t) => t.source !== 'mic')
      : allNew
    if (filtered.length === 0) {
      lastProcessedIndex.current = latest.length - 1
      return
    }

    const latestText = filtered.map((t) => t.text).join(' ')
    log.debug('[Final] Processing accumulated transcripts', {
      count: filtered.length,
      text: latestText.trim(),
      length: latestText.trim().length,
    })

    if (latestText.trim().length < FINAL_MIN_LENGTH) {
      lastProcessedIndex.current = latest.length - 1
      return
    }

    lastProcessedIndex.current = latest.length - 1
    const finalTrimmed = latestText.trim()

    // 次のinterim発話に備えてリセット
    const lastGen = lastGeneratedTextRef.current
    lastGeneratedTextRef.current = ''

    // Layer 1: 想定質問キャッシュで最終確認
    const match = findMatch(finalTrimmed)
    if (match) {
      log.info('[Final] Instant Q&A match confirmed', {
        query: finalTrimmed.substring(0, 30),
        matched: match.question.substring(0, 30),
        similarity: match.similarity.toFixed(3),
      })
      abortGeneration()
      updateCachedMatch(match)
      return
    }

    // マッチなし → キャッシュクリア
    if (cachedMatchRef.current) {
      updateCachedMatch(null)
    }

    // 前回interim生成テキストとの類似度をログ（スキップはしない）
    // 以前は類似度60%以上でfinal再生成をスキップしていたが、
    // interim生成が中断された場合に不完全な回答が残るバグがあったため、
    // finalでは常に再生成する
    if (lastGen) {
      const shorter = lastGen.length <= finalTrimmed.length ? lastGen : finalTrimmed
      const longer = lastGen.length > finalTrimmed.length ? lastGen : finalTrimmed
      let matches = 0
      for (let i = 0; i < shorter.length; i++) {
        if (shorter[i] === longer[i]) matches++
      }
      const similarity = longer.length > 0 ? matches / longer.length : 0
      log.debug('[Final] Similarity check (always regenerate)', {
        lastGen,
        finalText: finalTrimmed,
        similarity: similarity.toFixed(2),
      })
    }

    // 大きく異なる場合、またはinterim生成がなかった場合にAI生成
    // Layer 1.5: 部分マッチがあればPredicted Outputsで高速化
    const partialMatch = findPartialMatch(finalTrimmed)
    log.info('[Final] Triggering AI generation', {
      text: finalTrimmed,
      length: finalTrimmed.length,
      hadInterimGen: !!lastGen,
      hasPredictedAnswer: !!partialMatch,
      partialMatchSimilarity: partialMatch?.similarity.toFixed(3),
    })
    const hasCachedDocs = !!cachedDocumentContextRef.current
    generateStreamResponse(
      finalTrimmed,
      buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
      {
        includeDocumentContext: !hasCachedDocs,
        ...(partialMatch && { predictedAnswer: partialMatch.answer }),
        // cascading無効: interimが既に回答済み。2段階生成の300-500ms削減
      },
    )
  }, [audioSource, cachedDocumentContextRef, generateStreamResponse, findMatch, findPartialMatch, abortGeneration, updateCachedMatch])

  // Final: 確定テキストを蓄積し、同一話者の連続フラグメントをまとめて処理
  // STTが1つの発話を複数のfinal transcriptに分割する場合に対応
  useEffect(() => {
    if (!autoGenerateAI) return

    const newTranscripts = transcripts.slice(lastProcessedIndex.current + 1)
    if (newTranscripts.length === 0) return

    // bothモードのみsource分離（mic=自分の声をスキップ）、単一ソースではフィルタなし
    const interviewerTranscripts = audioSource === 'both'
      ? newTranscripts.filter((t) => t.source !== 'mic')
      : newTranscripts

    // 面接官のtranscriptがない（candidateのみ）→ 蓄積中のfinalがあれば即時処理
    if (interviewerTranscripts.length === 0) {
      if (finalAccumulateRef.current) {
        clearTimeout(finalAccumulateRef.current)
        finalAccumulateRef.current = null
        processFinalTranscripts()
        // processFinalTranscripts内でlastProcessedIndexを更新済み
      } else {
        lastProcessedIndex.current = transcripts.length - 1
      }
      return
    }

    // 面接官のtranscriptあり → デバウンスで蓄積（分割対策）
    // 新しいfragmentが到着するたびにタイマーをリセット
    if (finalAccumulateRef.current) clearTimeout(finalAccumulateRef.current)
    finalAccumulateRef.current = setTimeout(() => {
      finalAccumulateRef.current = null
      processFinalTranscripts()
    }, FINAL_ACCUMULATE_MS)

    return () => {
      if (finalAccumulateRef.current) clearTimeout(finalAccumulateRef.current)
    }
  }, [transcripts, audioSource, autoGenerateAI, processFinalTranscripts])

  /** 録音開始時にリセット */
  const resetState = useCallback(() => {
    lastProcessedIndex.current = -1
    lastGeneratedTextRef.current = ''
    if (finalAccumulateRef.current) {
      clearTimeout(finalAccumulateRef.current)
      finalAccumulateRef.current = null
    }
    if (interimDebounceRef.current) {
      clearTimeout(interimDebounceRef.current)
      interimDebounceRef.current = null
    }
  }, [])

  return {
    cachedMatch,
    refreshQuestionCache: refreshCache,
    clearQuestionCache: clearCache,
    resetProgressiveAI: resetState,
  }
}
