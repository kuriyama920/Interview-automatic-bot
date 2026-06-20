import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import {
  useLatencyMetrics,
  persistMetrics,
  MAX_METRICS_HISTORY,
} from '../../src/renderer/src/hooks/useLatencyMetrics'
import type { LatencyMetrics } from '../../src/renderer/src/hooks/useLatencyMetrics'

describe('useLatencyMetrics', () => {
  let mockLocalStorage: Record<string, string>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockLocalStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key]
      }),
      clear: vi.fn(() => {
        mockLocalStorage = {}
      }),
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('record()', () => {
    it('should not throw when recording a new turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'm1_sttReceived', 1000)
        })
      }).not.toThrow()
    })

    it('should not throw when updating an existing entry', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'm2_triggered', 1050)
        })
      }).not.toThrow()
    })

    it('should handle recording boolean fields (m6_ragTimedOut)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'm6_ragTimedOut', true)
        })
      }).not.toThrow()
    })

    it('should handle recording phase field', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'phase', 'speculative')
        })
      }).not.toThrow()
    })

    it('should handle recording speculative adoption fields (D-3)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'speculative_adopted', true)
          result.current.record('turn-1', 'speculative_changeRate', 0.15)
          result.current.record('turn-1', 'speculative_reason', 'accepted')
        })
      }).not.toThrow()
    })
  })

  describe('finalize()', () => {
    it('should calculate ttft as m12 - m1 when both exist', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].ttft).toBe(1500)
    })

    it('should calculate preProcTime as m7 - m4 when both exist', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm4_workerReceived', 1100)
        result.current.record('turn-1', 'm7_openaiCalled', 1400)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].preProcTime).toBe(300)
    })

    it('should calculate openaiTtfb as m8 - m7 when both exist', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm7_openaiCalled', 1400)
        result.current.record('turn-1', 'm8_openaiFirstChunk', 1800)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].openaiTtfb).toBe(400)
    })

    it('should leave ttft undefined when m1 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].ttft).toBeUndefined()
    })

    it('should leave ttft undefined when m12 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].ttft).toBeUndefined()
    })

    it('should calculate deliveryLatency as m12 - m9', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm9_sseSent', 1600)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored[stored.length - 1].deliveryLatency).toBe(900)
    })

    it('should call persistMetrics with finalized data (deferred via setTimeout)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      // persistMetrics is deferred: localStorage should NOT be called synchronously
      expect(localStorage.setItem).not.toHaveBeenCalled()

      // After timers run, localStorage should be updated
      act(() => {
        vi.runAllTimers()
      })

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'latency_metrics',
        expect.any(String)
      )

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored).toBeInstanceOf(Array)
      expect(stored[stored.length - 1].turnId).toBe('turn-1')
      expect(stored[stored.length - 1].ttft).toBe(1500)
    })

    it('should do nothing for a non-existent turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      // Should not throw
      act(() => {
        result.current.finalize('non-existent')
      })

      // Even after timers run, localStorage should not be called for missing turnId
      act(() => {
        vi.runAllTimers()
      })

      expect(localStorage.setItem).not.toHaveBeenCalled()
    })

    it('should calculate all derived metrics together', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-1', 'm4_workerReceived', 1100)
        result.current.record('turn-1', 'm7_openaiCalled', 1400)
        result.current.record('turn-1', 'm8_openaiFirstChunk', 1800)
        result.current.record('turn-1', 'm9_sseSent', 1900)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      const metrics = stored[stored.length - 1]
      expect(metrics.ttft).toBe(1500)         // m12 - m1
      expect(metrics.preProcTime).toBe(300)    // m7 - m4
      expect(metrics.openaiTtfb).toBe(400)     // m8 - m7
      expect(metrics.deliveryLatency).toBe(600) // m12 - m9
    })
  })

  describe('persistMetrics()', () => {
    it('should append finalized metrics to localStorage (after deferred flush)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      // Deferred: not yet written
      expect(localStorage.setItem).not.toHaveBeenCalled()

      act(() => {
        vi.runAllTimers()
      })

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'latency_metrics',
        expect.any(String)
      )

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored).toHaveLength(1)
      expect(stored[0].turnId).toBe('turn-1')
    })

    it('should append to existing localStorage data', () => {
      // Pre-populate localStorage
      const existing = [{ turnId: 'old-turn', timestamp: 500, m1_sttReceived: 500 }]
      mockLocalStorage['latency_metrics'] = JSON.stringify(existing)

      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored).toHaveLength(2)
      expect(stored[0].turnId).toBe('old-turn')
      expect(stored[1].turnId).toBe('turn-1')
    })

    it('should trim localStorage to MAX_METRICS_HISTORY', () => {
      // Pre-populate with MAX_METRICS_HISTORY items
      const existing = Array.from({ length: MAX_METRICS_HISTORY }, (_, i) => ({
        turnId: `old-${i}`,
        timestamp: i,
      }))
      mockLocalStorage['latency_metrics'] = JSON.stringify(existing)

      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-new', 'm1_sttReceived', 9999)
      })

      act(() => {
        result.current.finalize('turn-new')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored).toHaveLength(MAX_METRICS_HISTORY)
      // First item should be old-1 (old-0 was trimmed)
      expect(stored[0].turnId).toBe('old-1')
      expect(stored[stored.length - 1].turnId).toBe('turn-new')
    })

    it('should handle corrupt localStorage data gracefully', () => {
      mockLocalStorage['latency_metrics'] = 'not valid json'

      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      // Should not throw on finalize
      act(() => {
        result.current.finalize('turn-1')
      })

      // Should not throw on timer flush either
      expect(() => {
        act(() => {
          vi.runAllTimers()
        })
      }).not.toThrow()

      // Should still persist the new entry
      expect(localStorage.setItem).toHaveBeenCalled()
      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      expect(stored).toHaveLength(1)
      expect(stored[0].turnId).toBe('turn-1')
    })

    it('should handle localStorage.setItem failure silently', () => {
      ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      // Should not throw even after timer flush
      expect(() => {
        act(() => {
          vi.runAllTimers()
        })
      }).not.toThrow()
    })

    it('should log console.warn when localStorage.setItem throws', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      ;(localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[latency-metrics] Failed to persist metrics'),
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })

    it('should log console.warn when localStorage has corrupt data', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      mockLocalStorage['latency_metrics'] = 'not valid json'

      persistMetrics({ turnId: 'turn-1', timestamp: 1000 })

      act(() => {
        vi.runAllTimers()
      })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[latency-metrics] Failed to load persisted metrics'),
        expect.any(Error),
      )
      warnSpy.mockRestore()
    })
  })

  describe('edge cases', () => {
    it('should handle multiple rapid records for the same turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'm1_sttReceived', 1000)
          result.current.record('turn-1', 'm2_triggered', 1010)
          result.current.record('turn-1', 'm3_ipcSent', 1020)
          result.current.record('turn-1', 'm10_chunkReceived', 1500)
          result.current.record('turn-1', 'm11_stateUpdated', 1510)
          result.current.record('turn-1', 'm12_uiRendered', 1520)
        })
      }).not.toThrow()
    })

    it('should handle worker-side metrics (received via SSE)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      expect(() => {
        act(() => {
          result.current.record('turn-1', 'm4_workerReceived', 1100)
          result.current.record('turn-1', 'm5_usageCompleted', 1150)
          result.current.record('turn-1', 'm6_ragCompleted', 1300)
          result.current.record('turn-1', 'm7_openaiCalled', 1350)
          result.current.record('turn-1', 'm8_openaiFirstChunk', 1700)
          result.current.record('turn-1', 'm9_sseSent', 1710)
        })
      }).not.toThrow()
    })

    it('should overwrite a metric point if recorded again (verified via finalize)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1100)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      act(() => {
        vi.runAllTimers()
      })

      const stored = JSON.parse(
        (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1]
      )
      // ttft should be m12 - m1 = 2500 - 1100 = 1400 (using overwritten value)
      expect(stored[stored.length - 1].ttft).toBe(1400)
    })

    it('should maintain separate metrics for different turnIds (verified via finalize)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-1', 'm12_uiRendered', 2000)
        result.current.record('turn-2', 'm1_sttReceived', 3000)
        result.current.record('turn-2', 'm12_uiRendered', 5000)
      })

      act(() => {
        result.current.finalize('turn-1')
        result.current.finalize('turn-2')
      })

      act(() => {
        vi.runAllTimers()
      })

      // Two setItem calls (one per finalize, each deferred)
      const calls = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls
      // The last call should contain both finalized entries
      const stored = JSON.parse(calls[calls.length - 1][1])
      const turn1 = stored.find((m: LatencyMetrics) => m.turnId === 'turn-1')
      const turn2 = stored.find((m: LatencyMetrics) => m.turnId === 'turn-2')
      expect(turn1.ttft).toBe(1000)
      expect(turn2.ttft).toBe(2000)
    })
  })
})
