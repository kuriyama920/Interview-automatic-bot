/**
 * Conversation History Hook
 *
 * 面接の対話履歴を「Topic Tracking + Sliding Window」方式で構築。
 * - 直近5ターン: 原文そのまま（スライディングウィンドウ）
 * - それ以前: 面接官の質問文のみ保持（トピックトラッキング）
 * - セッションスコープ: transcripts がクリアされると自動リセット
 * - audioSource === 'both' 時のみ有効（話者区別が必要）
 *
 * 業界標準パターン:
 *   短い会話（<20ターン）→ スライディングウィンドウ
 *   中程度（20-100）→ ウィンドウ + LLM要約
 *   長い（100+）→ 階層的要約 / 会話RAG
 * 面接は10-20ターンのため、スライディングウィンドウが最適。
 * 古いターンは面接官の質問のみ保持し、既出トピックの重複防止に活用。
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
 * - 古いターン: 面接官の質問文のみ（トピックマーカー）
 * - 直近ターン: 面接官・候補者ともに原文（スライディングウィンドウ）
 */
function buildSections(
  olderTurns: ConversationTurn[],
  recentTurns: ConversationTurn[],
): string {
  const parts: string[] = []

  // トピックトラッキング: 既出の質問一覧
  if (olderTurns.length > 0) {
    const topics = olderTurns.map((turn) => `- ${turn.interviewer}`)
    parts.push('【既出の質問】\n' + topics.join('\n'))
  }

  // スライディングウィンドウ: 直近の対話原文
  if (recentTurns.length > 0) {
    const recentLines = recentTurns.map((turn) => {
      return `面接官: ${turn.interviewer}\nあなた: ${turn.candidate}`
    })
    parts.push('【直近の対話】\n' + recentLines.join('\n'))
  }

  return parts.join('\n---\n')
}

/**
 * ターン配列をフォーマット。
 * 文字数上限を超える場合は古いトピックを丸ごと削除。
 */
function formatHistoryString(turns: ConversationTurn[]): string {
  if (turns.length === 0) return ''

  for (let dropCount = 0; dropCount < turns.length; dropCount++) {
    const remaining = turns.slice(dropCount)
    const recentStart = Math.max(0, remaining.length - RECENT_TURN_COUNT)
    const olderTurns = remaining.slice(0, recentStart)
    const recentTurns = remaining.slice(recentStart)

    const result = buildSections(olderTurns, recentTurns)
    if (result.length <= MAX_HISTORY_CHARS) {
      return `これまでの対話:\n${result}`
    }
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
  return useMemo(() => {
    if (audioSource !== 'both') return ''
    const turns = parseTranscriptsToTurns(transcripts)
    return formatHistoryString(turns)
  }, [transcripts, audioSource])
}
