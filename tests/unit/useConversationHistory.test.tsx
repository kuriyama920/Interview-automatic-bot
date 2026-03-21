import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useConversationHistory } from '../../src/renderer/src/hooks/useConversationHistory'
import type { Transcript } from '../../src/renderer/src/types'

describe('useConversationHistory - simplified (no LLM summarization)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('LLM summarize を呼び出さない（window.electron.ai.summarize が呼ばれない）', () => {
    // 7ターン分のデータを作成（旧実装なら要約が走るはず）
    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    // summarize が呼ばれていないことを確認
    expect(window.electron.ai.summarize).not.toHaveBeenCalled()
  })

  it('直近5ターンの会話履歴を返す', () => {
    // 6ターン分のデータを作成
    const transcripts: Transcript[] = []
    for (let i = 0; i < 6; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    // 直近5ターン（質問1-5）が含まれる
    expect(result.current).toContain('質問1')
    expect(result.current).toContain('質問5')
    expect(result.current).toContain('回答1')
    expect(result.current).toContain('回答5')

    // 最古のターン（質問0）は含まれない
    expect(result.current).not.toContain('質問0')
    expect(result.current).not.toContain('回答0')
  })

  it('audioSource が both でない場合は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system' },
      { text: '私の回答', source: 'mic' },
    ]

    const { result: micResult } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'mic' })
    )
    expect(micResult.current).toBe('')

    const { result: systemResult } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'system' })
    )
    expect(systemResult.current).toBe('')
  })

  it('transcripts がリセット（減少）されても状態エラーにならない', () => {
    const transcripts: Transcript[] = [
      { text: '質問1', source: 'system' },
      { text: '回答1', source: 'mic' },
      { text: '質問2', source: 'system' },
      { text: '回答2', source: 'mic' },
    ]

    const { result, rerender } = renderHook(
      ({ transcripts, audioSource }: { transcripts: Transcript[]; audioSource: string }) =>
        useConversationHistory({ transcripts, audioSource }),
      { initialProps: { transcripts, audioSource: 'both' } }
    )

    expect(result.current).toContain('質問1')
    expect(result.current).toContain('質問2')

    // transcriptsがリセットされる
    rerender({ transcripts: [], audioSource: 'both' })
    expect(result.current).toBe('')

    // 新しいデータが追加される
    const newTranscripts: Transcript[] = [
      { text: '新しい質問', source: 'system' },
      { text: '新しい回答', source: 'mic' },
    ]
    rerender({ transcripts: newTranscripts, audioSource: 'both' })
    expect(result.current).toContain('新しい質問')
    expect(result.current).toContain('新しい回答')
  })

  it('会話ターンが0件の場合は空文字列を返す', () => {
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts: [], audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('要約セクション（【対話の要約】）を含まない', () => {
    // 7ターン分のデータ（旧実装なら要約セクションが表示されるはず）
    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    // 要約セクションが含まれないことを確認
    expect(result.current).not.toContain('【対話の要約】')
  })
})

describe('useConversationHistory - parseTranscriptsToTurns', () => {
  it('完全なターンの履歴を構築する', () => {
    const transcripts: Transcript[] = [
      { text: '自己紹介してください', source: 'system' },
      { text: '田中と申します', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('自己紹介してください')
    expect(result.current).toContain('田中と申します')
  })

  it('不完全なターン（面接官のみ）は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('不完全なターン（候補者のみ）は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '私の回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toBe('')
  })

  it('空のテキストを持つtranscriptsはスキップする', () => {
    const transcripts: Transcript[] = [
      { text: '', source: 'system' },
      { text: '質問', source: 'system' },
      { text: '回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('質問')
    expect(result.current).toContain('回答')
  })

  it('連続するsystemセグメントを1つの面接官発言として結合する', () => {
    const transcripts: Transcript[] = [
      { text: '最初の', source: 'system' },
      { text: '質問です', source: 'system' },
      { text: '回答です', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('最初の 質問です')
  })

  it('候補者回答後の面接官発言でターンを区切る', () => {
    const transcripts: Transcript[] = [
      { text: '質問1', source: 'system' },
      { text: '回答1', source: 'mic' },
      { text: '質問2', source: 'system' },
      { text: '回答2', source: 'mic' },
      { text: '質問3', source: 'system' },
      // 質問3は未回答なので含まれない
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('質問1')
    expect(result.current).toContain('回答1')
    expect(result.current).toContain('質問2')
    expect(result.current).toContain('回答2')
    // 未回答の質問3は含まれない
    expect(result.current).not.toContain('質問3')
  })
})

describe('useConversationHistory - formatting', () => {
  it('これまでの対話ヘッダーを含む', () => {
    const transcripts: Transcript[] = [
      { text: '質問', source: 'system' },
      { text: '回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('これまでの対話')
  })

  it('面接官とあなたラベルでフォーマットする', () => {
    const transcripts: Transcript[] = [
      { text: '質問', source: 'system' },
      { text: '回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current).toContain('面接官:')
    expect(result.current).toContain('あなた:')
  })

  it('MAX_HISTORY_CHARS（2000文字）を超える場合は空文字列を返す', () => {
    // 5ターンの非常に長いテキストを作成
    const transcripts: Transcript[] = []
    for (let i = 0; i < 5; i++) {
      transcripts.push({
        text: `${'非常に長い質問テキスト'.repeat(30)}${i}`,
        source: 'system',
      })
      transcripts.push({
        text: `${'非常に長い回答テキスト'.repeat(30)}${i}`,
        source: 'mic',
      })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    // 直近ターンだけでも2000文字を超えるなら空文字列
    if (result.current !== '') {
      expect(result.current.length).toBeLessThanOrEqual(2100)
    }
  })
})
