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
import { countSentences } from '../utils/speculative-adoption'

const log = createLogger('useProgressiveAI')

const INTERIM_MIN_LENGTH = 3     // 最低3文字以上で生成開始（日本語は1文字=情報量大）
const INTERIM_DEBOUNCE_MS = 300  // 再生成のデバウンス間隔（reasoning_effort:'minimal'でTTFT短縮のため積極的に）
const FINAL_MIN_LENGTH = 3       // 確定テキストの最低文字数
const INTERIM_MAX_TOKENS = 400   // Interim用の短めトークン上限（短い回答スタイルに合わせて削減）
const FINAL_ACCUMULATE_MS = 200  // 同一話者のfinal transcriptを蓄積する待機時間（TTFT改善: 350→200ms）

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
  /** v2 Speculative/Committed Lane 生成関数（オプション）。未指定時は v1 にフォールバック */
  generateStreamResponseV2?: (text: string, context?: string, phase?: 'speculative' | 'committed', options?: GenerateOptions) => Promise<void>
  /** 直前の Speculative 生成テキスト（Committed Lane での比較用） */
  speculativeTextRef?: React.RefObject<string>
  /** レイテンシメトリクス記録用コールバック（オプション） */
  onMetrics?: {
    record: (turnId: string, point: string, value: number | boolean | string) => void
    finalize: (turnId: string) => void
  }
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
  generateStreamResponseV2,
  speculativeTextRef,
  onMetrics,
}: UseProgressiveAIOptions) {
  const { findMatch, refreshCache, clearCache } = useQuestionCache()
  const [cachedMatch, setCachedMatch] = useState<QuestionMatch | null>(null)
  const cachedMatchRef = useRef<QuestionMatch | null>(null)
  const conversationHistoryRef = useRef<string>('')
  conversationHistoryRef.current = conversationHistory

  const updateCachedMatch = useCallback((match: QuestionMatch | null) => {
    cachedMatchRef.current = match
    setCachedMatch(match)
  }, [])

  const pendingCommittedTurnIdRef = useRef<string | null>(null)
  const lastGeneratedTextRef = useRef<string>('')
  const interimDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalAccumulateRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentTextRef = useRef<string | null>(null)
  currentTextRef.current = currentText
  const transcriptsRef = useRef<Transcript[]>([])
  transcriptsRef.current = transcripts
  const lastProcessedIndex = useRef<number>(-1)

  // Stable refs for functions to avoid triggering the interim useEffect on every render
  const generateStreamResponseRef = useRef(generateStreamResponse)
  generateStreamResponseRef.current = generateStreamResponse
  const generateStreamResponseV2Ref = useRef(generateStreamResponseV2)
  generateStreamResponseV2Ref.current = generateStreamResponseV2
  const findMatchRef = useRef(findMatch)
  findMatchRef.current = findMatch
  const abortGenerationRef = useRef(abortGeneration)
  abortGenerationRef.current = abortGeneration
  const updateCachedMatchRef = useRef(updateCachedMatch)
  updateCachedMatchRef.current = updateCachedMatch

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
      const match = findMatchRef.current(trimmed)
      if (match) {
        log.info('[Interim] Instant Q&A match found', {
          query: trimmed.substring(0, 30),
          matched: match.question.substring(0, 30),
          similarity: match.similarity.toFixed(3),
        })
        abortGenerationRef.current()
        updateCachedMatchRef.current(match)
        lastGeneratedTextRef.current = trimmed
      } else {
        // マッチなし → キャッシュクリア（ref経由で依存ループを回避）
        if (cachedMatchRef.current) {
          updateCachedMatchRef.current(null)
        }

        // Layer 2: AI生成（初回は即座に、以降はデバウンスで）
        // v2があれば speculative phase、なければ v1 にフォールバック
        const triggerInterimGen = (text: string) => {
          if (generateStreamResponseV2Ref.current) {
            generateStreamResponseV2Ref.current(
              text,
              buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
              'speculative',
              { maxTokens: INTERIM_MAX_TOKENS },
            )
          } else {
            generateStreamResponseRef.current(
              text,
              buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
              { includeDocumentContext: false, maxTokens: INTERIM_MAX_TOKENS },
            )
          }
        }

        if (!lastGeneratedTextRef.current) {
          log.info('[Interim] Triggering AI generation (initial)', {
            text: trimmed,
            length: trimmed.length,
            source: currentSource,
          })
          lastGeneratedTextRef.current = trimmed
          triggerInterimGen(trimmed)
        } else if (trimmed.length > lastGeneratedTextRef.current.length * 2.0) {
          // 2回目以降: テキストが100%以上（2倍以上）長くなった場合、デバウンスで再生成
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
            triggerInterimGen(latestText)
          }, INTERIM_DEBOUNCE_MS)
        }
      }
    }

    // 常にクリーンアップを返す（早期リターンでもペンディング中のタイマーをクリア）
    return () => {
      if (interimDebounceRef.current) clearTimeout(interimDebounceRef.current)
    }
  }, [currentText, currentSource, audioSource, autoGenerateAI])

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

    // finalでは常にAI再生成する（interim生成の有無に関わらず）
    const hasCachedDocs = !!cachedDocumentContextRef.current
    const turnId = crypto.randomUUID()

    // レイテンシメトリクス: Final処理開始を記録
    onMetrics?.record(turnId, 'm2_triggered', Date.now())

    log.info('[Final] Triggering AI generation', {
      text: finalTrimmed,
      length: finalTrimmed.length,
      hadInterimGen: !!lastGen,
      useV2: !!generateStreamResponseV2,
    })

    if (generateStreamResponseV2) {
      // v2: Committed Lane（gpt-4.1-nano）
      const specText = speculativeTextRef?.current || undefined

      // Set pending turn ID for post-committed adoption check (W-01)
      pendingCommittedTurnIdRef.current = turnId

      generateStreamResponseV2(
        finalTrimmed,
        buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
        'committed',
        {
          includeDocumentContext: !hasCachedDocs,
          ...(specText && { speculativeText: specText }),
          turnId,
        },
      )

      // D-2/D-3: Speculative テキストの存在を記録
      // committed テキストはまだストリーミング中のため、採用判定はここでは行わない。
      // 採用判定（Levenshtein変化率比較）は committed 完了後に実施する。
      // ここでは品質ガードレール（文字数・文数）の事前チェックのみ記録。
      if (specText && onMetrics) {
        const passesLengthGuard = specText.length >= 80
        const passesSentenceGuard = countSentences(specText) >= 2
        const preCheckPassed = passesLengthGuard && passesSentenceGuard

        onMetrics.record(turnId, 'speculative_adopted', false) // committed完了まで未確定
        onMetrics.record(turnId, 'speculative_changeRate', -1) // 未計算（sentinel値）
        onMetrics.record(turnId, 'speculative_reason',
          !passesLengthGuard ? 'speculative_too_short'
            : !passesSentenceGuard ? 'too_few_sentences'
            : 'pending_committed')

        log.info('[Final] Speculative pre-check', {
          preCheckPassed,
          specLength: specText.length,
        })
      }
    } else {
      generateStreamResponse(
        finalTrimmed,
        buildContext(cachedDocumentContextRef.current, conversationHistoryRef.current),
        {
          includeDocumentContext: !hasCachedDocs,
          turnId,
        },
      )
    }

    // 注: finalize()はuseAIResponse側で生成完了時に呼ばれる。
    // m10-m12（チャンク受信〜UI描画）を含めた全メトリクスが記録された後にfinalizeされる。
    onMetrics?.record(turnId, 'm3_ipcSent', Date.now())
  }, [audioSource, cachedDocumentContextRef, generateStreamResponse, generateStreamResponseV2, speculativeTextRef, findMatch, abortGeneration, updateCachedMatch, onMetrics])

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
    pendingCommittedTurnIdRef.current = null
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
    pendingCommittedTurnIdRef,
  }
}
