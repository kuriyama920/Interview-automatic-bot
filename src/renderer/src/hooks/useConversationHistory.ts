/**
 * Conversation History Hook
 *
 * 直近5ターンの会話履歴 + ローリングサマリーをAIコンテキストとして提供する。
 * store: false 固定により OpenAI 側に会話履歴は保存されないため、
 * クライアント側で会話文脈を管理する。
 *
 * - ローリングサマリー: 6ターン目以降、直近5ターンより前の会話を累積要約
 * - 直近5ターン: 原文そのまま（スライディングウィンドウ）
 * - audioSource === 'both' 時のみ有効（話者区別が必要）
 */

import { useMemo, useState, useCallback, useRef } from 'react'
import type { Transcript } from '../types'
import { createLogger } from '../utils/logger'

const log = createLogger('useConversationHistory')

export const RECENT_TURN_COUNT = 5
// 50分面接（~20ターン）を想定: 直近5ターン原文(~1500文字) + 要約(~800文字) + ヘッダー(~200文字)
// gpt-5-nano/gpt-5.4-nano のコンテキスト枠(128K+)に対して十分余裕あり。
// コスト影響: ~2000トークン追加 → gpt-5.4-nano で $0.0004/回（無視可能）
const MAX_HISTORY_CHARS = 4000

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
 *
 * 最適化: maxTurns が指定された場合、直近のターンのみ保持する循環バッファ方式で
 * メモリ割り当てを最小化する。
 */
export function parseTranscriptsToTurns(transcripts: Transcript[], maxTurns?: number): ConversationTurn[] {
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

  // maxTurns が指定された場合、直近のターンのみ返す
  if (maxTurns !== undefined && turns.length > maxTurns) {
    return turns.slice(turns.length - maxTurns)
  }

  return turns
}

/**
 * サマリー + 直近ターンから履歴文字列を構築（テスト用にexport）。
 * 文字数上限を超える場合は空文字列を返す。
 */
export function formatHistoryWithSummary(
  recentTurns: ConversationTurn[],
  summary?: string,
): string {
  const hasSummary = !!summary && summary.length > 0
  const hasRecentTurns = recentTurns.length > 0

  if (!hasSummary && !hasRecentTurns) return ''

  const parts: string[] = []

  if (hasSummary) {
    parts.push(`【会話要約】\n${summary}`)
  }

  if (hasRecentTurns) {
    const recentLines = recentTurns.map((turn) => {
      return `面接官: ${turn.interviewer}\nあなた: ${turn.candidate}`
    })
    parts.push('【直近の対話】\n' + recentLines.join('\n'))
  }

  const result = `これまでの対話:\n${parts.join('\n\n')}`
  if (result.length > MAX_HISTORY_CHARS) {
    return ''
  }

  return result
}

export interface UseConversationHistoryResult {
  /** AI contextに渡す履歴文字列 */
  historyString: string
  /** committed完了後に呼び出して要約を更新 */
  triggerSummarize: () => void
  /** 録音開始/クリア時に呼び出してサマリーをリセット */
  resetSummary: () => void
  /** 全ターン数（要約トリガー判定用） */
  turnCount: number
}

interface UseConversationHistoryOptions {
  transcripts: Transcript[]
  audioSource: string
}

// 要約呼び出しの最小間隔（トークン消費保護）
const SUMMARIZE_COOLDOWN_MS = 15_000

export function useConversationHistory({
  transcripts,
  audioSource,
}: UseConversationHistoryOptions): UseConversationHistoryResult {
  const [rollingSummary, setRollingSummary] = useState('')
  const summarizingRef = useRef(false)
  // 要約済みターン数を追跡（同じターンの二重要約防止）
  const summarizedTurnCountRef = useRef(0)
  // [HIGH fix] generation counter: resetSummary 後の stale write を防止
  const generationRef = useRef(0)
  // [MEDIUM fix] クールダウン: 連続呼び出しによるトークン消費を抑制
  const lastSummarizeTimeRef = useRef(0)

  // 全ターン解析（要約対象の判定に使用）
  const allTurns = useMemo(() => {
    if (audioSource !== 'both') return []
    return parseTranscriptsToTurns(transcripts)
  }, [transcripts, audioSource])

  // 直近5ターン（AI contextに原文として渡す）
  const recentTurns = useMemo(() => {
    if (allTurns.length <= RECENT_TURN_COUNT) return allTurns
    return allTurns.slice(allTurns.length - RECENT_TURN_COUNT)
  }, [allTurns])

  // [MEDIUM fix] refs で triggerSummarize を安定化（STTフラグメントごとの再作成を防止）
  const allTurnsRef = useRef<ConversationTurn[]>([])
  allTurnsRef.current = allTurns
  const rollingSummaryRef = useRef('')
  rollingSummaryRef.current = rollingSummary

  // 要約トリガー: 直近5ターンより前の最新ターンを要約
  const triggerSummarize = useCallback(() => {
    if (audioSource !== 'both') return
    if (summarizingRef.current) return

    const turns = allTurnsRef.current
    const summary = rollingSummaryRef.current

    if (turns.length <= RECENT_TURN_COUNT) return

    // クールダウンチェック
    const now = Date.now()
    if (now - lastSummarizeTimeRef.current < SUMMARIZE_COOLDOWN_MS) return

    // 要約すべきターン: 直近5ターンの1つ前
    const targetIndex = turns.length - RECENT_TURN_COUNT - 1
    if (targetIndex < 0) return
    // 既に要約済みなら何もしない
    if (turns.length - RECENT_TURN_COUNT <= summarizedTurnCountRef.current) return

    const turn = turns[targetIndex]
    summarizingRef.current = true
    lastSummarizeTimeRef.current = now
    const generation = generationRef.current

    log.info('Triggering rolling summary', {
      turnIndex: targetIndex,
      totalTurns: turns.length,
      previousSummaryLength: summary.length,
    })

    window.electron.ai.summarize(summary, turn.interviewer, turn.candidate)
      .then((result) => {
        // [HIGH fix] リセット後の stale write を防止
        if (generation !== generationRef.current) return
        if (result.success && result.summary) {
          setRollingSummary(result.summary)
          summarizedTurnCountRef.current = allTurnsRef.current.length - RECENT_TURN_COUNT
          log.info('Rolling summary updated', { summaryLength: result.summary.length })
        } else {
          log.warn('Summarization failed', { error: result.error })
        }
      })
      .catch((error) => {
        log.warn('Summarization error (non-blocking)', { error: String(error) })
      })
      .finally(() => {
        summarizingRef.current = false
      })
  }, [audioSource]) // refs経由でアクセスするため依存は audioSource のみ

  // サマリーリセット
  const resetSummary = useCallback(() => {
    setRollingSummary('')
    summarizedTurnCountRef.current = 0
    summarizingRef.current = false
    generationRef.current += 1 // in-flight の Promise を無効化
  }, [])

  // 最終的な履歴文字列を構築
  const historyString = useMemo(() => {
    if (audioSource !== 'both') return ''
    return formatHistoryWithSummary(recentTurns, rollingSummary)
  }, [recentTurns, audioSource, rollingSummary])

  return {
    historyString,
    triggerSummarize,
    resetSummary,
    turnCount: allTurns.length,
  }
}
