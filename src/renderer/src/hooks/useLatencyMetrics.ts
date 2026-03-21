import { useCallback, useRef } from 'react'

export interface LatencyMetrics {
  turnId: string
  timestamp: number
  // Client-side measurements
  m1_sttReceived?: number
  m2_triggered?: number
  m3_ipcSent?: number
  m10_chunkReceived?: number
  m11_stateUpdated?: number
  m12_uiRendered?: number
  // Worker-side measurements (received via SSE metrics event)
  m4_workerReceived?: number
  m5_usageCompleted?: number
  m6_ragCompleted?: number
  m6_ragTimedOut?: boolean
  m7_openaiCalled?: number
  m8_openaiFirstChunk?: number
  m9_sseSent?: number
  // Derived metrics
  ttft?: number
  preProcTime?: number
  openaiTtfb?: number
  deliveryLatency?: number
  // Generation phase
  phase?: 'speculative' | 'committed' | 'cache_hit'
  // Speculative adoption tracking (D-3)
  speculative_adopted?: boolean
  speculative_changeRate?: number
  speculative_reason?: string
}

export type MetricPoint = keyof Omit<LatencyMetrics, 'turnId' | 'timestamp' | 'ttft' | 'preProcTime' | 'openaiTtfb' | 'deliveryLatency'>

export const MAX_METRICS_HISTORY = 100

const STORAGE_KEY = 'latency_metrics'

function loadPersistedMetrics(): LatencyMetrics[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function computeDelta(a?: number, b?: number): number | undefined {
  return a !== undefined && b !== undefined ? a - b : undefined
}

export function persistMetrics(metrics: LatencyMetrics): void {
  // Defer localStorage write to avoid blocking the main thread after finalize().
  // localStorage I/O is synchronous; deferring prevents UI jank in edge cases.
  setTimeout(() => {
    try {
      const existing = loadPersistedMetrics()
      const updated = [...existing, metrics]

      // Trim to MAX_METRICS_HISTORY from the front
      const trimmed = updated.length > MAX_METRICS_HISTORY
        ? updated.slice(updated.length - MAX_METRICS_HISTORY)
        : updated

      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {
      // Non-critical feature - silently ignore errors (e.g. QuotaExceededError)
    }
  }, 0)
}

export function useLatencyMetrics() {
  const metricsRef = useRef<Map<string, LatencyMetrics>>(new Map())

  const record = useCallback(
    (turnId: string, point: MetricPoint, value: number | boolean | string) => {
      const existing = metricsRef.current.get(turnId)

      const base: LatencyMetrics = existing ?? { turnId, timestamp: Date.now() }
      const updated: LatencyMetrics = { ...base, [point]: value }
      metricsRef.current.set(turnId, updated)
    },
    []
  )

  const finalize = useCallback((turnId: string) => {
    const metrics = metricsRef.current.get(turnId)
    if (!metrics) {
      return
    }

    const finalized: LatencyMetrics = {
      ...metrics,
      ttft: computeDelta(metrics.m12_uiRendered, metrics.m1_sttReceived),
      preProcTime: computeDelta(metrics.m7_openaiCalled, metrics.m4_workerReceived),
      openaiTtfb: computeDelta(metrics.m8_openaiFirstChunk, metrics.m7_openaiCalled),
      deliveryLatency: computeDelta(metrics.m12_uiRendered, metrics.m9_sseSent),
    }

    metricsRef.current.set(turnId, finalized)

    // Enforce MAX_METRICS_HISTORY
    if (metricsRef.current.size > MAX_METRICS_HISTORY) {
      const firstKey = metricsRef.current.keys().next().value
      if (firstKey !== undefined) {
        metricsRef.current.delete(firstKey)
      }
    }

    // Persist to localStorage
    persistMetrics(finalized)
  }, [])

  const getMetrics = useCallback((turnId: string): LatencyMetrics | undefined => {
    return metricsRef.current.get(turnId)
  }, [])

  const getAllMetrics = useCallback((): LatencyMetrics[] => {
    return Array.from(metricsRef.current.values())
  }, [])

  return { record, finalize, getMetrics, getAllMetrics }
}
