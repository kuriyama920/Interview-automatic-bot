import { describe, it, expect } from 'vitest'
import { percentile, analyzeMetrics } from '../../scripts/analyze-latency'
import type { LatencyMetrics } from '../../scripts/analyze-latency'

describe('percentile', () => {
  it('空配列は0を返す', () => {
    expect(percentile([], 50)).toBe(0)
    expect(percentile([], 95)).toBe(0)
  })

  it('[100, 200, 300, 400, 500] のp50は300', () => {
    expect(percentile([100, 200, 300, 400, 500], 50)).toBe(300)
  })

  it('[100, 200, 300, 400, 500] のp95は500', () => {
    expect(percentile([100, 200, 300, 400, 500], 95)).toBe(500)
  })

  it('単一要素の配列は常にその値を返す', () => {
    expect(percentile([42], 50)).toBe(42)
    expect(percentile([42], 95)).toBe(42)
    expect(percentile([42], 1)).toBe(42)
    expect(percentile([42], 100)).toBe(42)
  })

  it('未ソートの配列でも正しく計算する', () => {
    expect(percentile([500, 100, 300, 200, 400], 50)).toBe(300)
  })

  it('元の配列をミューテートしない', () => {
    const original = [500, 100, 300, 200, 400]
    const copy = [...original]
    percentile(original, 50)
    expect(original).toEqual(copy)
  })
})

describe('analyzeMetrics', () => {
  it('空配列は全て0を返す', () => {
    const result = analyzeMetrics([])
    expect(result.ttft).toEqual({ p50: 0, p95: 0, max: 0, count: 0 })
    expect(result.preProcTime).toEqual({ p50: 0, p95: 0 })
    expect(result.openaiTtfb).toEqual({ p50: 0, p95: 0 })
    expect(result.ragTimeoutRate).toBe(0)
  })

  it('ttftのp50/p95が正しく計算される', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, ttft: 100 },
      { turnId: '2', timestamp: 2000, ttft: 200 },
      { turnId: '3', timestamp: 3000, ttft: 300 },
      { turnId: '4', timestamp: 4000, ttft: 400 },
      { turnId: '5', timestamp: 5000, ttft: 500 },
    ]
    const result = analyzeMetrics(records)
    expect(result.ttft.p50).toBe(300)
    expect(result.ttft.p95).toBe(500)
    expect(result.ttft.max).toBe(500)
    expect(result.ttft.count).toBe(5)
  })

  it('preProcTimeがundefinedのレコードは除外される', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, preProcTime: 50 },
      { turnId: '2', timestamp: 2000 }, // preProcTime undefined
      { turnId: '3', timestamp: 3000, preProcTime: 150 },
      { turnId: '4', timestamp: 4000 }, // preProcTime undefined
      { turnId: '5', timestamp: 5000, preProcTime: 250 },
    ]
    const result = analyzeMetrics(records)
    expect(result.preProcTime.p50).toBe(150)
    expect(result.preProcTime.p95).toBe(250)
  })

  it('ttftがundefinedのレコードは除外される', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, ttft: 100 },
      { turnId: '2', timestamp: 2000 }, // ttft undefined
      { turnId: '3', timestamp: 3000, ttft: 300 },
    ]
    const result = analyzeMetrics(records)
    expect(result.ttft.count).toBe(2)
    expect(result.ttft.p50).toBe(100)
    expect(result.ttft.max).toBe(300)
  })

  it('openaiTtfbがundefinedのレコードは除外される', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, openaiTtfb: 80 },
      { turnId: '2', timestamp: 2000 }, // openaiTtfb undefined
      { turnId: '3', timestamp: 3000, openaiTtfb: 120 },
    ]
    const result = analyzeMetrics(records)
    expect(result.openaiTtfb.p50).toBe(80)
    expect(result.openaiTtfb.p95).toBe(120)
  })

  it('ragTimeoutRateが0%の場合（タイムアウトなし）', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000 },
      { turnId: '2', timestamp: 2000 },
      { turnId: '3', timestamp: 3000 },
    ]
    const result = analyzeMetrics(records)
    expect(result.ragTimeoutRate).toBe(0)
  })

  it('ragTimedOut=trueのレコード割合が計算される', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, m6_ragTimedOut: true },
      { turnId: '2', timestamp: 2000, m6_ragTimedOut: false },
      { turnId: '3', timestamp: 3000, m6_ragTimedOut: true },
      { turnId: '4', timestamp: 4000 },
    ]
    const result = analyzeMetrics(records)
    // 2 out of 4 = 0.5
    expect(result.ragTimeoutRate).toBe(0.5)
  })

  it('全レコードがragTimedOut=trueの場合は1.0を返す', () => {
    const records: LatencyMetrics[] = [
      { turnId: '1', timestamp: 1000, m6_ragTimedOut: true },
      { turnId: '2', timestamp: 2000, m6_ragTimedOut: true },
    ]
    const result = analyzeMetrics(records)
    expect(result.ragTimeoutRate).toBe(1)
  })
})
