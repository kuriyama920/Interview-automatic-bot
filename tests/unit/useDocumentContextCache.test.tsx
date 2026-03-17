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

import { useDocumentContextCache } from '../../src/renderer/src/hooks/useDocumentContextCache'

const mockAI = window.electron.ai

describe('useDocumentContextCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockAI.prefetchContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      context: 'ドキュメントコンテキスト',
    })
  })

  it('should return cachedContextRef, prefetch, and clear', () => {
    const { result } = renderHook(() => useDocumentContextCache())
    expect(result.current.cachedContextRef).toBeDefined()
    expect(typeof result.current.prefetch).toBe('function')
    expect(typeof result.current.clear).toBe('function')
  })

  it('should start with empty cache', () => {
    const { result } = renderHook(() => useDocumentContextCache())
    expect(result.current.cachedContextRef.current).toBe('')
  })

  it('should prefetch and cache context', async () => {
    const { result } = renderHook(() => useDocumentContextCache())

    await act(async () => {
      await result.current.prefetch()
    })

    expect(mockAI.prefetchContext).toHaveBeenCalled()
    expect(result.current.cachedContextRef.current).toBe('ドキュメントコンテキスト')
  })

  it('should clear cache to empty string', async () => {
    const { result } = renderHook(() => useDocumentContextCache())

    await act(async () => {
      await result.current.prefetch()
    })
    expect(result.current.cachedContextRef.current).toBe('ドキュメントコンテキスト')

    act(() => {
      result.current.clear()
    })
    expect(result.current.cachedContextRef.current).toBe('')
  })

  it('should set empty cache when prefetch returns no context', async () => {
    ;(mockAI.prefetchContext as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      context: '',
      error: 'No documents',
    })

    const { result } = renderHook(() => useDocumentContextCache())

    await act(async () => {
      await result.current.prefetch()
    })

    expect(result.current.cachedContextRef.current).toBe('')
  })

  it('should handle prefetch errors gracefully', async () => {
    ;(mockAI.prefetchContext as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDocumentContextCache())

    await act(async () => {
      await result.current.prefetch()
    })

    expect(result.current.cachedContextRef.current).toBe('')
  })
})
