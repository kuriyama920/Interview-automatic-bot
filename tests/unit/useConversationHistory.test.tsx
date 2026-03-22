import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useConversationHistory, RECENT_TURN_COUNT } from '../../src/renderer/src/hooks/useConversationHistory'
import type { Transcript } from '../../src/renderer/src/types'

describe('useConversationHistory - ローリングサマリー統合', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('5ターン以下では triggerSummarize を呼んでも要約APIを呼ばない', () => {
    const transcripts: Transcript[] = []
    for (let i = 0; i < 4; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    act(() => {
      result.current.triggerSummarize()
    })

    expect(window.electron.ai.summarize).not.toHaveBeenCalled()
  })

  it('6ターン以上で triggerSummarize を呼ぶと要約APIを呼ぶ', async () => {
    ;(window.electron.ai.summarize as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      summary: '候補者はReact5年の経験がある。DB移行PJ経験あり。',
    })

    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    expect(result.current.turnCount).toBe(7)

    await act(async () => {
      result.current.triggerSummarize()
      // Promiseを解決させる
      await vi.waitFor(() => {
        expect(window.electron.ai.summarize).toHaveBeenCalledTimes(1)
      })
    })

    // 要約APIが呼ばれたことを確認
    expect(window.electron.ai.summarize).toHaveBeenCalledWith(
      '', // previousSummary（初回は空）
      expect.any(String), // interviewer
      expect.any(String), // candidate
    )
  })

  it('要約成功後に historyString に要約セクションが含まれる', async () => {
    const mockSummary = '候補者はReact5年の経験がある'
    ;(window.electron.ai.summarize as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      summary: mockSummary,
    })

    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    await act(async () => {
      result.current.triggerSummarize()
      await vi.waitFor(() => {
        expect(window.electron.ai.summarize).toHaveBeenCalled()
      })
    })

    // フラッシュ後に要約が反映される
    await vi.waitFor(() => {
      expect(result.current.historyString).toContain('【会話要約】')
      expect(result.current.historyString).toContain(mockSummary)
    })
  })

  it('resetSummary でサマリーがクリアされる', async () => {
    ;(window.electron.ai.summarize as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      summary: '要約テキスト',
    })

    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    await act(async () => {
      result.current.triggerSummarize()
      await vi.waitFor(() => {
        expect(window.electron.ai.summarize).toHaveBeenCalled()
      })
    })

    await vi.waitFor(() => {
      expect(result.current.historyString).toContain('【会話要約】')
    })

    act(() => {
      result.current.resetSummary()
    })

    expect(result.current.historyString).not.toContain('【会話要約】')
  })

  it('直近5ターンの会話履歴を返す', () => {
    const transcripts: Transcript[] = []
    for (let i = 0; i < 6; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    // 直近5ターン（質問1-5）が含まれる
    expect(result.current.historyString).toContain('質問1')
    expect(result.current.historyString).toContain('質問5')
    expect(result.current.historyString).toContain('回答1')
    expect(result.current.historyString).toContain('回答5')

    // 最古のターン（質問0）は含まれない
    expect(result.current.historyString).not.toContain('質問0')
    expect(result.current.historyString).not.toContain('回答0')
  })

  it('audioSource が both でない場合は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system' },
      { text: '私の回答', source: 'mic' },
    ]

    const { result: micResult } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'mic' })
    )
    expect(micResult.current.historyString).toBe('')

    const { result: systemResult } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'system' })
    )
    expect(systemResult.current.historyString).toBe('')
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

    expect(result.current.historyString).toContain('質問1')
    expect(result.current.historyString).toContain('質問2')

    rerender({ transcripts: [], audioSource: 'both' })
    expect(result.current.historyString).toBe('')

    const newTranscripts: Transcript[] = [
      { text: '新しい質問', source: 'system' },
      { text: '新しい回答', source: 'mic' },
    ]
    rerender({ transcripts: newTranscripts, audioSource: 'both' })
    expect(result.current.historyString).toContain('新しい質問')
    expect(result.current.historyString).toContain('新しい回答')
  })

  it('会話ターンが0件の場合は空文字列を返す', () => {
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts: [], audioSource: 'both' })
    )
    expect(result.current.historyString).toBe('')
  })

  it('turnCount が正しいターン数を返す', () => {
    const transcripts: Transcript[] = []
    for (let i = 0; i < 8; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current.turnCount).toBe(8)
  })

  it('要約失敗時もエラーにならない（非ブロッキング）', async () => {
    ;(window.electron.ai.summarize as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Usage limit exceeded',
    })

    const transcripts: Transcript[] = []
    for (let i = 0; i < 7; i++) {
      transcripts.push({ text: `質問${i}`, source: 'system' })
      transcripts.push({ text: `回答${i}`, source: 'mic' })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    await act(async () => {
      result.current.triggerSummarize()
      await vi.waitFor(() => {
        expect(window.electron.ai.summarize).toHaveBeenCalled()
      })
    })

    // エラーが起きても historyString は正常に動作する
    expect(result.current.historyString).toContain('【直近の対話】')
    expect(result.current.historyString).not.toContain('【会話要約】')
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
    expect(result.current.historyString).toContain('自己紹介してください')
    expect(result.current.historyString).toContain('田中と申します')
  })

  it('不完全なターン（面接官のみ）は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '面接官の質問', source: 'system' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current.historyString).toBe('')
  })

  it('不完全なターン（候補者のみ）は空文字列を返す', () => {
    const transcripts: Transcript[] = [
      { text: '私の回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current.historyString).toBe('')
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
    expect(result.current.historyString).toContain('質問')
    expect(result.current.historyString).toContain('回答')
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
    expect(result.current.historyString).toContain('最初の 質問です')
  })

  it('候補者回答後の面接官発言でターンを区切る', () => {
    const transcripts: Transcript[] = [
      { text: '質問1', source: 'system' },
      { text: '回答1', source: 'mic' },
      { text: '質問2', source: 'system' },
      { text: '回答2', source: 'mic' },
      { text: '質問3', source: 'system' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current.historyString).toContain('質問1')
    expect(result.current.historyString).toContain('回答1')
    expect(result.current.historyString).toContain('質問2')
    expect(result.current.historyString).toContain('回答2')
    expect(result.current.historyString).not.toContain('質問3')
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
    expect(result.current.historyString).toContain('これまでの対話')
  })

  it('面接官とあなたラベルでフォーマットする', () => {
    const transcripts: Transcript[] = [
      { text: '質問', source: 'system' },
      { text: '回答', source: 'mic' },
    ]
    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )
    expect(result.current.historyString).toContain('面接官:')
    expect(result.current.historyString).toContain('あなた:')
  })

  it('MAX_HISTORY_CHARS（4000文字）を超える場合は空文字列を返す', () => {
    const transcripts: Transcript[] = []
    for (let i = 0; i < 5; i++) {
      transcripts.push({
        text: `${'非常に長い質問テキスト'.repeat(60)}${i}`,
        source: 'system',
      })
      transcripts.push({
        text: `${'非常に長い回答テキスト'.repeat(60)}${i}`,
        source: 'mic',
      })
    }

    const { result } = renderHook(() =>
      useConversationHistory({ transcripts, audioSource: 'both' })
    )

    if (result.current.historyString !== '') {
      expect(result.current.historyString.length).toBeLessThanOrEqual(4100)
    }
  })
})
