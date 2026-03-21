import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  RAG_SOFT_DEADLINE_MS,
  withSoftDeadline,
} from '../../src/lib/latency-budget'

describe('RAG_SOFT_DEADLINE_MS', () => {
  it('is 400ms', () => {
    expect(RAG_SOFT_DEADLINE_MS).toBe(400)
  })
})

describe('withSoftDeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the resolved value when promise settles before deadline', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('result'), 100)
    })

    const resultPromise = withSoftDeadline(promise, 'fallback', 500)

    await vi.advanceTimersByTimeAsync(100)

    const result = await resultPromise
    expect(result).toBe('result')
  })

  it('returns fallback when promise exceeds deadline', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('slow-result'), 1000)
    })

    const resultPromise = withSoftDeadline(promise, 'fallback', 200)

    await vi.advanceTimersByTimeAsync(200)

    const result = await resultPromise
    expect(result).toBe('fallback')
  })

  it('returns empty string fallback on timeout when fallback is empty string', async () => {
    const promise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('data'), 1000)
    })

    const resultPromise = withSoftDeadline(promise, '', 300)

    await vi.advanceTimersByTimeAsync(300)

    const result = await resultPromise
    expect(result).toBe('')
  })

  it('returns fallback when promise rejects after deadline expires', async () => {
    const promise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('network error')), 500)
    })

    const resultPromise = withSoftDeadline(promise, 'safe-fallback', 200)

    // Advance past deadline so fallback wins the race
    await vi.advanceTimersByTimeAsync(200)
    const result = await resultPromise
    expect(result).toBe('safe-fallback')

    // Advance past rejection time to flush the timer and prevent unhandled rejection leak
    await vi.advanceTimersByTimeAsync(300)
  })

  it('returns fallback when promise rejects before deadline', async () => {
    // Use synchronous rejection (no setTimeout) to avoid PromiseRejectionHandledWarning
    // that occurs when fake timers fire rejection before microtasks run catch handlers
    let rejectFn!: (err: Error) => void
    const promise = new Promise<string>((_, reject) => {
      rejectFn = reject
    })

    const resultPromise = withSoftDeadline(promise, 'fallback', 500)

    // Reject synchronously — catch handler is already attached by withSoftDeadline
    rejectFn(new Error('fast error'))

    const result = await resultPromise
    expect(result).toBe('fallback')
  })
})
