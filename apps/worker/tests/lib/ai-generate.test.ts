import { describe, it, expect, vi } from 'vitest'
import {
  DOCUMENT_TYPE_LABELS,
  groupDocumentChunks,
  formatGroupedContext,
  deferDbWrite,
} from '../../src/lib/ai-generate'

describe('DOCUMENT_TYPE_LABELS', () => {
  it('contains labels for resume, job_posting, and expected_qa', () => {
    expect(DOCUMENT_TYPE_LABELS.resume).toBe('履歴書')
    expect(DOCUMENT_TYPE_LABELS.job_posting).toBe('求人票')
    expect(DOCUMENT_TYPE_LABELS.expected_qa).toBe('想定質問')
  })
})

describe('groupDocumentChunks', () => {
  it('returns empty map for empty array', () => {
    const result = groupDocumentChunks([])
    expect(result.size).toBe(0)
  })

  it('groups chunks by key with label', () => {
    const items = [
      { key: 'doc1', type: 'resume', name: '職務経歴書.pdf', content: 'chunk1' },
      { key: 'doc1', type: 'resume', name: '職務経歴書.pdf', content: 'chunk2' },
      { key: 'doc2', type: 'job_posting', name: '求人.pdf', content: 'chunk3' },
    ]
    const result = groupDocumentChunks(items)

    expect(result.size).toBe(2)
    expect(result.get('doc1')).toEqual({
      label: '履歴書: 職務経歴書.pdf',
      chunks: ['chunk1', 'chunk2'],
    })
    expect(result.get('doc2')).toEqual({
      label: '求人票: 求人.pdf',
      chunks: ['chunk3'],
    })
  })

  it('uses expected_qa label (bug fix: was missing in prefetch)', () => {
    const items = [
      { key: 'qa1', type: 'expected_qa', name: 'Q&A.txt', content: '質問と回答' },
    ]
    const result = groupDocumentChunks(items)

    expect(result.get('qa1')).toEqual({
      label: '想定質問: Q&A.txt',
      chunks: ['質問と回答'],
    })
  })

  it('falls back to raw type when type is unknown', () => {
    const items = [
      { key: 'other1', type: 'custom_type', name: 'doc.txt', content: 'text' },
    ]
    const result = groupDocumentChunks(items)

    expect(result.get('other1')!.label).toBe('custom_type: doc.txt')
  })
})

describe('formatGroupedContext', () => {
  it('returns empty string for empty map', () => {
    const result = formatGroupedContext(new Map())
    expect(result).toBe('')
  })

  it('formats grouped chunks with labels', () => {
    const grouped = new Map([
      ['doc1', { label: '履歴書: test.pdf', chunks: ['line1', 'line2'] }],
      ['doc2', { label: '求人票: job.pdf', chunks: ['line3'] }],
    ])
    const result = formatGroupedContext(grouped)

    expect(result).toBe(
      '【履歴書: test.pdf】\nline1\nline2\n\n【求人票: job.pdf】\nline3'
    )
  })

  it('truncates result when maxLength is provided', () => {
    const grouped = new Map([
      ['doc1', { label: '履歴書: test.pdf', chunks: ['a'.repeat(100)] }],
    ])
    const result = formatGroupedContext(grouped, 50)

    expect(result.length).toBe(50)
  })
})

describe('deferDbWrite', () => {
  it('calls adjustReservedUsage and recordUsage', async () => {
    const adjustFn = vi.fn().mockResolvedValue(undefined)
    const recordFn = vi.fn().mockResolvedValue(undefined)

    await deferDbWrite({
      adjustReservedUsage: adjustFn,
      recordUsage: recordFn,
      reservedAmount: 800,
      actualAmount: 150,
      metadata: { model: 'gpt-5-nano' },
    })

    expect(adjustFn).toHaveBeenCalledWith(800, 150)
    expect(recordFn).toHaveBeenCalledWith(150, { model: 'gpt-5-nano' })
  })

  it('skips recordUsage when actualAmount is 0', async () => {
    const adjustFn = vi.fn().mockResolvedValue(undefined)
    const recordFn = vi.fn().mockResolvedValue(undefined)

    await deferDbWrite({
      adjustReservedUsage: adjustFn,
      recordUsage: recordFn,
      reservedAmount: 800,
      actualAmount: 0,
      metadata: { model: 'gpt-5-nano' },
    })

    expect(adjustFn).toHaveBeenCalledWith(800, 0)
    expect(recordFn).not.toHaveBeenCalled()
  })

  it('uses waitUntil when ctx is provided', async () => {
    const adjustFn = vi.fn().mockResolvedValue(undefined)
    const recordFn = vi.fn().mockResolvedValue(undefined)
    const waitUntil = vi.fn()
    const ctx = { waitUntil } as unknown as ExecutionContext

    deferDbWrite({
      adjustReservedUsage: adjustFn,
      recordUsage: recordFn,
      reservedAmount: 800,
      actualAmount: 150,
      metadata: { model: 'gpt-5-nano' },
      ctx,
    })

    expect(waitUntil).toHaveBeenCalledTimes(1)
    // The promise passed to waitUntil should resolve
    await waitUntil.mock.calls[0][0]
    expect(adjustFn).toHaveBeenCalled()
  })

  it('awaits directly when ctx is not provided', async () => {
    const adjustFn = vi.fn().mockResolvedValue(undefined)
    const recordFn = vi.fn().mockResolvedValue(undefined)

    await deferDbWrite({
      adjustReservedUsage: adjustFn,
      recordUsage: recordFn,
      reservedAmount: 800,
      actualAmount: 100,
      metadata: {},
    })

    expect(adjustFn).toHaveBeenCalled()
    expect(recordFn).toHaveBeenCalled()
  })
})
