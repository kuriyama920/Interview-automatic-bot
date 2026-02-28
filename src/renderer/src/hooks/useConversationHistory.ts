/**
 * Conversation History Hook
 *
 * 面接の対話履歴を「LLM要約 + Sliding Window」方式で構築。
 * - 直近5ターン: 原文そのまま（スライディングウィンドウ）
 * - それ以前: バックグラウンドLLM要約（候補者の主張・数値・エピソードを保持）
 * - セッションスコープ: transcripts がクリアされると自動リセット
 * - audioSource === 'both' 時のみ有効（話者区別が必要）
 *
 * 要約タイミング:
 *   各ターン完了後（候補者回答→次の面接官発言の境界）にバックグラウンドで実行。
 *   ターン間は10-30秒あるため、要約（1-2秒）は次の質問に十分間に合う。
 *   失敗時は面接官の質問文のみ保持するフォールバックで信頼性を確保。
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { Transcript } from '../types'
import { createLogger } from '../utils/logger'

const log = createLogger('useConversationHistory')

const RECENT_TURN_COUNT = 5
// 約500-1000トークン。RAGコンテキスト（~1000トークン）と合わせて
// gpt-5-nanoのコンテキスト枠内に収まるサイズ。
const MAX_HISTORY_CHARS = 2000

export interface ConversationTurn {
  interviewer: string
  candidate: string
}

/**
 * transcripts 配列から会話ターンを解析。
 * 1ターン = 連続する system 発言 + 連続する mic 発言。
 * ターン境界: source が mic → system に切り替わった時点。
 *
 * 注意: 候補者がまだ回答していない面接官の発言（末尾のsystemセグメント）は
 * 意図的に除外。現在の質問は generateStreamResponse の question 引数で渡される。
 */
function parseTranscriptsToTurns(transcripts: Transcript[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let interviewerParts: string[] = []
  let candidateParts: string[] = []

  for (const t of transcripts) {
    if (!t.text.trim()) continue
    if (t.source === 'system') {
      // 候補者発言の後に面接官が再び話し始めた → 前のターンを閉じる
      if (candidateParts.length > 0 && interviewerParts.length > 0) {
        turns.push({
          interviewer: interviewerParts.join(' '),
          candidate: candidateParts.join(' '),
        })
        interviewerParts = []
        candidateParts = []
      }
      interviewerParts.push(t.text)
    } else if (t.source === 'mic') {
      candidateParts.push(t.text)
    }
  }

  // 最後のターンを閉じる（両方揃っている場合のみ）
  if (interviewerParts.length > 0 && candidateParts.length > 0) {
    turns.push({
      interviewer: interviewerParts.join(' '),
      candidate: candidateParts.join(' '),
    })
  }

  return turns
}

/**
 * セクション文字列を組み立てる。
 * - 要約: LLM生成の要約（古いターンの候補者主張・数値・エピソード）
 * - 直近ターン: 面接官・候補者ともに原文（スライディングウィンドウ）
 */
function buildSections(summary: string, recentTurns: ConversationTurn[]): string {
  const parts: string[] = []

  if (summary) {
    parts.push('【対話の要約】\n' + summary)
  }

  if (recentTurns.length > 0) {
    const recentLines = recentTurns.map((turn) => {
      return `面接官: ${turn.interviewer}\nあなた: ${turn.candidate}`
    })
    parts.push('【直近の対話】\n' + recentLines.join('\n'))
  }

  return parts.join('\n---\n')
}

/**
 * 履歴文字列を組み立てる。
 * 文字数上限を超える場合は要約を切り詰める。
 */
function formatHistoryString(
  summary: string,
  recentTurns: ConversationTurn[],
): string {
  if (!summary && recentTurns.length === 0) return ''

  const result = buildSections(summary, recentTurns)
  if (result.length <= MAX_HISTORY_CHARS) {
    return `これまでの対話:\n${result}`
  }

  // 要約が長すぎる場合、要約を省略して直近ターンのみ
  const recentOnly = buildSections('', recentTurns)
  if (recentOnly.length <= MAX_HISTORY_CHARS) {
    return `これまでの対話:\n${recentOnly}`
  }

  return ''
}

interface UseConversationHistoryOptions {
  transcripts: Transcript[]
  audioSource: string
}

export function useConversationHistory({
  transcripts,
  audioSource,
}: UseConversationHistoryOptions): string {
  const [rollingSummary, setRollingSummary] = useState('')
  const rollingSummaryRef = useRef('')
  const summarizedCountRef = useRef(0)
  const isSummarizingRef = useRef(false)
  const prevTranscriptsLengthRef = useRef(0)

  // ref を state と同期（stale closure 回避）
  useEffect(() => {
    rollingSummaryRef.current = rollingSummary
  }, [rollingSummary])

  // transcripts がクリアされた（録音再開など）→ 状態リセット
  useEffect(() => {
    if (transcripts.length < prevTranscriptsLengthRef.current) {
      log.info('Transcripts reset detected, clearing summary')
      setRollingSummary('')
      rollingSummaryRef.current = ''
      summarizedCountRef.current = 0
      isSummarizingRef.current = false
    }
    prevTranscriptsLengthRef.current = transcripts.length
  }, [transcripts.length])

  // ターン解析（useMemo で再計算を最小化）
  const turns = useMemo(() => {
    if (audioSource !== 'both') return []
    return parseTranscriptsToTurns(transcripts)
  }, [transcripts, audioSource])

  // バックグラウンド要約: 新しいターンが完了したらLLMで要約
  const summarizeNewTurns = useCallback(async (
    turnsToSummarize: ConversationTurn[],
    currentSummary: string,
  ) => {
    let summary = currentSummary

    for (const turn of turnsToSummarize) {
      try {
        const result = await window.electron.ai.summarize(
          summary,
          turn.interviewer,
          turn.candidate,
        )

        if (result.success && result.summary) {
          summary = result.summary
          log.info('Turn summarized successfully', {
            summaryLength: summary.length,
          })
        } else {
          // フォールバック: 面接官の質問のみ追加
          log.warn('Summarization failed, using fallback', { error: result.error })
          const fallback = `Q: ${turn.interviewer}`
          summary = summary ? `${summary}\n${fallback}` : fallback
        }
      } catch (error) {
        log.error('Summarization error, using fallback', { error })
        const fallback = `Q: ${turn.interviewer}`
        summary = summary ? `${summary}\n${fallback}` : fallback
      }
    }

    return summary
  }, [])

  useEffect(() => {
    if (audioSource !== 'both') return

    // 要約対象: RECENT_TURN_COUNT より前のターンで未要約のもの
    const turnsToSummarizeCount = Math.max(0, turns.length - RECENT_TURN_COUNT)
    const newTurnsCount = turnsToSummarizeCount - summarizedCountRef.current

    if (newTurnsCount <= 0 || isSummarizingRef.current) return

    const newTurns = turns.slice(summarizedCountRef.current, turnsToSummarizeCount)
    isSummarizingRef.current = true
    let cancelled = false

    log.info('Starting background summarization', {
      newTurnsCount,
      totalTurns: turns.length,
      alreadySummarized: summarizedCountRef.current,
    })

    summarizeNewTurns(newTurns, rollingSummaryRef.current).then((updatedSummary) => {
      if (!cancelled) {
        setRollingSummary(updatedSummary)
        rollingSummaryRef.current = updatedSummary
        summarizedCountRef.current = turnsToSummarizeCount
      }
      isSummarizingRef.current = false
    }).catch((error) => {
      log.error('Background summarization failed completely', { error })
      isSummarizingRef.current = false
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns, audioSource, summarizeNewTurns])

  // 最終的な履歴文字列を構築
  return useMemo(() => {
    if (audioSource !== 'both') return ''

    const recentStart = Math.max(0, turns.length - RECENT_TURN_COUNT)
    const recentTurns = turns.slice(recentStart)

    return formatHistoryString(rollingSummary, recentTurns)
  }, [turns, rollingSummary, audioSource])
}
