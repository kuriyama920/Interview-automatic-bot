/**
 * Conversation History Hook (簡素化版)
 *
 * Phase 1.5以降: Responses APIの previous_response_id によりサーバー側で
 * 会話状態を保持するため、クライアント側のLLM要約が不要になった。
 * このフックは表示用の直近5ターンを提供する。
 *
 * - 直近5ターン: 原文そのまま（スライディングウィンドウ）
 * - audioSource === 'both' 時のみ有効（話者区別が必要）
 */

import { useMemo } from 'react'
import type { Transcript } from '../types'

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
 * セクション文字列を組み立てる。
 * - 直近ターン: 面接官・候補者ともに原文（スライディングウィンドウ）
 */
function buildSections(recentTurns: ConversationTurn[]): string {
  if (recentTurns.length === 0) return ''

  const recentLines = recentTurns.map((turn) => {
    return `面接官: ${turn.interviewer}\nあなた: ${turn.candidate}`
  })
  return '【直近の対話】\n' + recentLines.join('\n')
}

/**
 * 履歴文字列を組み立てる。
 * 文字数上限を超える場合は空文字列を返す。
 */
function formatHistoryString(recentTurns: ConversationTurn[]): string {
  if (recentTurns.length === 0) return ''

  const result = buildSections(recentTurns)
  if (result.length <= MAX_HISTORY_CHARS) {
    return `これまでの対話:\n${result}`
  }

  // 直近ターンでも文字数上限を超える場合は空文字列
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
  // ターン解析（useMemo で再計算を最小化）
  // maxTurns を渡して末尾から RECENT_TURN_COUNT 分だけ解析（大量のtranscriptsで高速化）
  const recentTurns = useMemo(() => {
    if (audioSource !== 'both') return []
    const turns = parseTranscriptsToTurns(transcripts, RECENT_TURN_COUNT)
    // parseTranscriptsToTurns が limit 付きで返すので slice 不要
    return turns.length > RECENT_TURN_COUNT
      ? turns.slice(turns.length - RECENT_TURN_COUNT)
      : turns
  }, [transcripts, audioSource])

  // 最終的な履歴文字列を構築
  return useMemo(() => {
    if (audioSource !== 'both') return ''
    return formatHistoryString(recentTurns)
  }, [recentTurns, audioSource])
}
