/**
 * useConversationHistory テスト
 *
 * ローリングサマリー統合を含む会話履歴管理のテスト。
 * - parseTranscriptsToTurns: transcript配列 → 会話ターン変換
 * - formatHistoryWithSummary: サマリー + 直近ターン → context文字列
 */

import { describe, it, expect } from 'vitest'
import {
  parseTranscriptsToTurns,
  formatHistoryWithSummary,
  type ConversationTurn,
} from '../../src/renderer/src/hooks/useConversationHistory'

describe('parseTranscriptsToTurns', () => {
  it('should parse alternating system/mic transcripts into turns', () => {
    const transcripts = [
      { text: '自己紹介を', source: 'system' as const },
      { text: 'React5年です', source: 'mic' as const },
      { text: '強みは？', source: 'system' as const },
      { text: '設計力です', source: 'mic' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(2)
    expect(turns[0]).toEqual({ interviewer: '自己紹介を', candidate: 'React5年です' })
    expect(turns[1]).toEqual({ interviewer: '強みは？', candidate: '設計力です' })
  })

  it('should exclude incomplete final interviewer turn', () => {
    const transcripts = [
      { text: '自己紹介を', source: 'system' as const },
      { text: 'React5年です', source: 'mic' as const },
      { text: '次の質問は', source: 'system' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(1)
  })

  it('should respect maxTurns parameter', () => {
    const transcripts = Array.from({ length: 10 }, (_, i) => [
      { text: `Q${i}`, source: 'system' as const },
      { text: `A${i}`, source: 'mic' as const },
    ]).flat()
    const turns = parseTranscriptsToTurns(transcripts, 3)
    expect(turns).toHaveLength(3)
    expect(turns[0].interviewer).toBe('Q7')
    expect(turns[2].interviewer).toBe('Q9')
  })

  it('should return empty array for empty transcripts', () => {
    expect(parseTranscriptsToTurns([])).toEqual([])
  })

  it('should skip empty text transcripts', () => {
    const transcripts = [
      { text: '', source: 'system' as const },
      { text: '   ', source: 'system' as const },
      { text: '質問です', source: 'system' as const },
      { text: '回答です', source: 'mic' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(1)
    expect(turns[0].interviewer).toBe('質問です')
  })

  it('should concatenate consecutive same-source transcripts', () => {
    const transcripts = [
      { text: '前半の質問', source: 'system' as const },
      { text: '後半の質問', source: 'system' as const },
      { text: '回答です', source: 'mic' as const },
    ]
    const turns = parseTranscriptsToTurns(transcripts)
    expect(turns).toHaveLength(1)
    expect(turns[0].interviewer).toBe('前半の質問 後半の質問')
  })
})

describe('formatHistoryWithSummary', () => {
  const recentTurns: ConversationTurn[] = [
    { interviewer: 'マネジメント経験は？', candidate: '5人チームのリーダーでした' },
    { interviewer: '最初のPJについて詳しく', candidate: 'DB移行を主導しました' },
  ]

  it('should format recent turns without summary', () => {
    const result = formatHistoryWithSummary(recentTurns)
    expect(result).toContain('【直近の対話】')
    expect(result).toContain('面接官: マネジメント経験は？')
    expect(result).toContain('あなた: 5人チームのリーダーでした')
    expect(result).not.toContain('【会話要約】')
  })

  it('should include summary section when provided', () => {
    const summary = '候補者はVue3年の経験を回答。△△PJでのDB移行を主導した経験を言及済み。'
    const result = formatHistoryWithSummary(recentTurns, summary)
    expect(result).toContain('【会話要約】')
    expect(result).toContain(summary)
    expect(result).toContain('【直近の対話】')
    // サマリーが直近の対話より前にあること
    const summaryIndex = result.indexOf('【会話要約】')
    const recentIndex = result.indexOf('【直近の対話】')
    expect(summaryIndex).toBeLessThan(recentIndex)
  })

  it('should return empty string for empty turns without summary', () => {
    expect(formatHistoryWithSummary([])).toBe('')
  })

  it('should return summary only when no recent turns', () => {
    const summary = '候補者はReact5年の経験がある'
    const result = formatHistoryWithSummary([], summary)
    expect(result).toContain('【会話要約】')
    expect(result).toContain(summary)
    expect(result).not.toContain('【直近の対話】')
  })

  it('should return empty string when result exceeds MAX_HISTORY_CHARS', () => {
    const longSummary = 'x'.repeat(4000)
    const result = formatHistoryWithSummary(recentTurns, longSummary)
    expect(result).toBe('')
  })

  it('should handle empty summary string same as no summary', () => {
    const withEmpty = formatHistoryWithSummary(recentTurns, '')
    const withUndefined = formatHistoryWithSummary(recentTurns)
    expect(withEmpty).toBe(withUndefined)
  })
})
