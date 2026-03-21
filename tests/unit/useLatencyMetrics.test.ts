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
    it('should create a new entry for a new turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics).toBeDefined()
      expect(metrics!.turnId).toBe('turn-1')
      expect(metrics!.m1_sttReceived).toBe(1000)
      expect(metrics!.timestamp).toBeDefined()
    })

    it('should update an existing entry and preserve other fields', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.record('turn-1', 'm2_triggered', 1050)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics).toBeDefined()
      expect(metrics!.m1_sttReceived).toBe(1000)
      expect(metrics!.m2_triggered).toBe(1050)
    })

    it('should set timestamp on first record for a turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      const beforeTime = Date.now()
      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })
      const afterTime = Date.now()

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(metrics!.timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should not overwrite timestamp on subsequent records', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      const firstTimestamp = result.current.getMetrics('turn-1')!.timestamp

      act(() => {
        result.current.record('turn-1', 'm2_triggered', 1050)
      })

      const secondTimestamp = result.current.getMetrics('turn-1')!.timestamp
      expect(secondTimestamp).toBe(firstTimestamp)
    })

    it('should handle recording boolean fields (m6_ragTimedOut)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm6_ragTimedOut', true)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.m6_ragTimedOut).toBe(true)
    })

    it('should handle recording phase field', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'phase', 'speculative')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.phase).toBe('speculative')
    })

    it('should handle recording speculative_adopted field (D-3)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'speculative_adopted', true)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.speculative_adopted).toBe(true)
    })

    it('should handle recording speculative_changeRate field (D-3)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'speculative_changeRate', 0.15)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.speculative_changeRate).toBe(0.15)
    })

    it('should handle recording speculative_reason field (D-3)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'speculative_reason', 'accepted')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.speculative_reason).toBe('accepted')
    })

    it('should record all speculative adoption fields together (D-3)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'speculative_adopted', false)
        result.current.record('turn-1', 'speculative_changeRate', 0.45)
        result.current.record('turn-1', 'speculative_reason', 'change_rate_exceeded')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.speculative_adopted).toBe(false)
      expect(metrics!.speculative_changeRate).toBe(0.45)
      expect(metrics!.speculative_reason).toBe('change_rate_exceeded')
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

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.ttft).toBe(1500)
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

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.preProcTime).toBe(300)
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

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.openaiTtfb).toBe(400)
    })

    it('should leave ttft undefined when m1 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.ttft).toBeUndefined()
    })

    it('should leave ttft undefined when m12 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.ttft).toBeUndefined()
    })

    it('should leave preProcTime undefined when m4 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm7_openaiCalled', 1400)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.preProcTime).toBeUndefined()
    })

    it('should leave openaiTtfb undefined when m7 is missing', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm8_openaiFirstChunk', 1800)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.openaiTtfb).toBeUndefined()
    })

    it('should leave deliveryLatency undefined (future implementation)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm9_sseSent', 1600)
        result.current.record('turn-1', 'm12_uiRendered', 2500)
      })

      act(() => {
        result.current.finalize('turn-1')
      })

      const metrics = result.current.getMetrics('turn-1')
      // deliveryLatency = m12 - m9, currently implemented
      expect(metrics!.deliveryLatency).toBe(900)
    })

    it('should remove oldest entry when exceeding MAX_METRICS_HISTORY', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      // Fill to MAX_METRICS_HISTORY
      for (let i = 0; i < MAX_METRICS_HISTORY; i++) {
        act(() => {
          result.current.record(`turn-${i}`, 'm1_sttReceived', 1000 + i)
        })
        act(() => {
          result.current.finalize(`turn-${i}`)
        })
      }

      expect(result.current.getAllMetrics()).toHaveLength(MAX_METRICS_HISTORY)

      // Add one more
      act(() => {
        result.current.record(`turn-overflow`, 'm1_sttReceived', 9999)
      })
      act(() => {
        result.current.finalize(`turn-overflow`)
      })

      const all = result.current.getAllMetrics()
      expect(all).toHaveLength(MAX_METRICS_HISTORY)
      // The oldest (turn-0) should have been removed
      expect(result.current.getMetrics('turn-0')).toBeUndefined()
      // The overflow entry should exist
      expect(result.current.getMetrics('turn-overflow')).toBeDefined()
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

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.ttft).toBe(1500)         // m12 - m1
      expect(metrics!.preProcTime).toBe(300)    // m7 - m4
      expect(metrics!.openaiTtfb).toBe(400)     // m8 - m7
      expect(metrics!.deliveryLatency).toBe(600) // m12 - m9
    })
  })

  describe('getMetrics()', () => {
    it('should return metrics for an existing turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics).toBeDefined()
      expect(metrics!.turnId).toBe('turn-1')
      expect(metrics!.m1_sttReceived).toBe(1000)
    })

    it('should return undefined for a non-existent turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      const metrics = result.current.getMetrics('non-existent')
      expect(metrics).toBeUndefined()
    })
  })

  describe('getAllMetrics()', () => {
    it('should return all entries as an array', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-2', 'm1_sttReceived', 2000)
        result.current.record('turn-3', 'm1_sttReceived', 3000)
      })

      const all = result.current.getAllMetrics()
      expect(all).toHaveLength(3)
      expect(all.map((m) => m.turnId).sort()).toEqual(['turn-1', 'turn-2', 'turn-3'])
    })

    it('should return an empty array when no metrics exist', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      const all = result.current.getAllMetrics()
      expect(all).toHaveLength(0)
      expect(all).toEqual([])
    })

    it('should return a new array each time (no shared reference)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      const first = result.current.getAllMetrics()
      const second = result.current.getAllMetrics()
      expect(first).not.toBe(second)
      expect(first).toEqual(second)
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
  })

  describe('edge cases', () => {
    it('should handle multiple rapid records for the same turnId', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-1', 'm2_triggered', 1010)
        result.current.record('turn-1', 'm3_ipcSent', 1020)
        result.current.record('turn-1', 'm10_chunkReceived', 1500)
        result.current.record('turn-1', 'm11_stateUpdated', 1510)
        result.current.record('turn-1', 'm12_uiRendered', 1520)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.m1_sttReceived).toBe(1000)
      expect(metrics!.m2_triggered).toBe(1010)
      expect(metrics!.m3_ipcSent).toBe(1020)
      expect(metrics!.m10_chunkReceived).toBe(1500)
      expect(metrics!.m11_stateUpdated).toBe(1510)
      expect(metrics!.m12_uiRendered).toBe(1520)
    })

    it('should handle worker-side metrics (received via SSE)', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm4_workerReceived', 1100)
        result.current.record('turn-1', 'm5_usageCompleted', 1150)
        result.current.record('turn-1', 'm6_ragCompleted', 1300)
        result.current.record('turn-1', 'm7_openaiCalled', 1350)
        result.current.record('turn-1', 'm8_openaiFirstChunk', 1700)
        result.current.record('turn-1', 'm9_sseSent', 1710)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.m4_workerReceived).toBe(1100)
      expect(metrics!.m5_usageCompleted).toBe(1150)
      expect(metrics!.m6_ragCompleted).toBe(1300)
      expect(metrics!.m7_openaiCalled).toBe(1350)
      expect(metrics!.m8_openaiFirstChunk).toBe(1700)
      expect(metrics!.m9_sseSent).toBe(1710)
    })

    it('should overwrite a metric point if recorded again', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
      })

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1100)
      })

      const metrics = result.current.getMetrics('turn-1')
      expect(metrics!.m1_sttReceived).toBe(1100)
    })

    it('should maintain separate metrics for different turnIds', () => {
      const { result } = renderHook(() => useLatencyMetrics())

      act(() => {
        result.current.record('turn-1', 'm1_sttReceived', 1000)
        result.current.record('turn-2', 'm1_sttReceived', 2000)
      })

      expect(result.current.getMetrics('turn-1')!.m1_sttReceived).toBe(1000)
      expect(result.current.getMetrics('turn-2')!.m1_sttReceived).toBe(2000)
    })
  })
})
