/**
 * Conversation History Hook
 *
 * 面接の対話履歴を「Summary + Recent」ハイブリッド形式で構築。
 * - 直近5ターン: 原文そのまま
 * - それ以前: 各発言の最初の1文を抽出（extractive summary）
 * - セッションスコープ: transcripts がクリアされると自動リセット
 * - audioSource === 'both' 時のみ有効（話者区別が必要）
 *
 * 出力は「これまでの対話:」ヘッダー付きで、RAGコンテキストと区別可能。
 */

import { useMemo } from 'react'
import type { Transcript } from '../types'

const RECENT_TURN_COUNT = 5
// 約500-1000トークン。RAGコンテキスト（~1000トークン）と合わせて
// gpt-5-nanoのコンテキスト枠内に収まるサイズ。
const MAX_HISTORY_CHARS = 2000
const MAX_SUMMARY_PER_TURN = 100

export interface ConversationTurn {
  interviewer: string
  candidate: string
}

/**
 * 最初の文を抽出（日本語・英語の句点に対応）
 */
function extractFirstSentence(text: string, maxLen: number): string {
  const trimmed = text.trimStart()
  const match = trimmed.match(/^.+?[。！？.!?\n]/)
  const sentence = match ? match[0].trimEnd() : trimmed
  if (sentence.length <= maxLen) return sentence
  return sentence.substring(0, maxLen - 1) + '…'
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
 * セクション文字列を組み立てる（要約 + 直近）
 */
function buildSections(
  olderTurns: ConversationTurn[],
  recentTurns: ConversationTurn[],
): string {
  const parts: string[] = []

  if (olderTurns.length > 0) {
    const summaryLines = olderTurns.map((turn) => {
      const q = extractFirstSentence(turn.interviewer, MAX_SUMMARY_PER_TURN)
      const a = extractFirstSentence(turn.candidate, MAX_SUMMARY_PER_TURN)
      return `面接官: ${q}\nあなた: ${a}`
    })
    parts.push('【対話の要約】\n' + summaryLines.join('\n'))
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
 * ターン配列をハイブリッド履歴文字列にフォーマット。
 * 文字数上限を超える場合は古いターンを丸ごと削除（途中切断を防止）。
 */
function formatHistoryString(turns: ConversationTurn[]): string {
  if (turns.length === 0) return ''

  // 古いターンを1つずつ落としながら文字数内に収める
  for (let dropCount = 0; dropCount < turns.length; dropCount++) {
    const remaining = turns.slice(dropCount)
    const recentStart = Math.max(0, remaining.length - RECENT_TURN_COUNT)
    const olderTurns = remaining.slice(0, recentStart)
    const recentTurns = remaining.slice(recentStart)

    const result = buildSections(olderTurns, recentTurns)
    if (result.length <= MAX_HISTORY_CHARS) {
      // 「これまでの対話:」ヘッダーでRAGコンテキストと明確に区別
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
    // 単一ソースモードでは話者区別不可 → 空文字を返す
    if (audioSource !== 'both') return ''
    const turns = parseTranscriptsToTurns(transcripts)
    return formatHistoryString(turns)
  }, [transcripts, audioSource])
}
