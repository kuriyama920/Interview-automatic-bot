export interface LatencyMetrics {
  turnId: string
  timestamp: number
  m1_sttReceived?: number
  m2_triggered?: number
  m3_ipcSent?: number
  m4_workerReceived?: number
  m5_usageCompleted?: number
  m6_ragCompleted?: number
  m6_ragTimedOut?: boolean
  m7_openaiCalled?: number
  m8_openaiFirstChunk?: number
  m9_sseSent?: number
  m10_chunkReceived?: number
  m11_stateUpdated?: number
  m12_uiRendered?: number
  ttft?: number
  preProcTime?: number
  openaiTtfb?: number
  deliveryLatency?: number
  phase?: string
}

/** p番目のパーセンタイルを計算 */
export function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

/** メトリクスを解析してレポートを生成 */
export function analyzeMetrics(records: LatencyMetrics[]): {
  ttft: { p50: number; p95: number; max: number; count: number }
  preProcTime: { p50: number; p95: number }
  openaiTtfb: { p50: number; p95: number }
  ragTimeoutRate: number
} {
  const ttftValues = records
    .map((r) => r.ttft)
    .filter((v): v is number => v !== undefined && v !== null)

  const preProcValues = records
    .map((r) => r.preProcTime)
    .filter((v): v is number => v !== undefined && v !== null)

  const openaiTtfbValues = records
    .map((r) => r.openaiTtfb)
    .filter((v): v is number => v !== undefined && v !== null)

  const ragTimedOutCount = records.filter((r) => r.m6_ragTimedOut === true).length
  const ragTimeoutRate = records.length === 0 ? 0 : ragTimedOutCount / records.length

  return {
    ttft: {
      p50: percentile(ttftValues, 50),
      p95: percentile(ttftValues, 95),
      max: ttftValues.length === 0 ? 0 : Math.max(...ttftValues),
      count: ttftValues.length,
    },
    preProcTime: {
      p50: percentile(preProcValues, 50),
      p95: percentile(preProcValues, 95),
    },
    openaiTtfb: {
      p50: percentile(openaiTtfbValues, 50),
      p95: percentile(openaiTtfbValues, 95),
    },
    ragTimeoutRate,
  }
}
