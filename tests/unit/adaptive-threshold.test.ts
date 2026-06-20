/**
 * AdaptiveThreshold テスト
 * 直近のSpeculative採用率に応じて changeRateThreshold を動的に調整する
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AdaptiveThreshold } from '../../src/renderer/src/utils/adaptive-threshold'

describe('AdaptiveThreshold', () => {
  let threshold: AdaptiveThreshold

  beforeEach(() => {
    threshold = new AdaptiveThreshold()
  })

  // 1. デフォルト閾値は0.3
  it('デフォルト閾値は0.3を返す', () => {
    expect(threshold.getThreshold()).toBe(0.3)
  })

  // 2. 採用率 >70% → 閾値0.4に緩和
  it('採用率が70%超の場合、閾値を0.4に緩和する', () => {
    // 20ターン中15採用 = 75%
    for (let i = 0; i < 15; i++) {
      threshold.recordAdoption(true)
    }
    for (let i = 0; i < 5; i++) {
      threshold.recordAdoption(false)
    }

    expect(threshold.getThreshold()).toBe(0.4)
  })

  // 3. 採用率 <30% → 閾値0.2に厳格化
  it('採用率が30%未満の場合、閾値を0.2に厳格化する', () => {
    // 20ターン中5採用 = 25%
    for (let i = 0; i < 5; i++) {
      threshold.recordAdoption(true)
    }
    for (let i = 0; i < 15; i++) {
      threshold.recordAdoption(false)
    }

    expect(threshold.getThreshold()).toBe(0.2)
  })

  // 4. 採用率 30-70%（中間）→ 閾値0.3を維持
  it('採用率が30-70%の場合、閾値0.3を維持する', () => {
    // 20ターン中10採用 = 50%
    for (let i = 0; i < 10; i++) {
      threshold.recordAdoption(true)
    }
    for (let i = 0; i < 10; i++) {
      threshold.recordAdoption(false)
    }

    expect(threshold.getThreshold()).toBe(0.3)
  })

  // 5. 記録が20未満の場合 → デフォルト0.3
  it('記録が20未満の場合、デフォルト閾値0.3を返す', () => {
    // 19件のみ記録
    for (let i = 0; i < 19; i++) {
      threshold.recordAdoption(true)
    }

    expect(threshold.getThreshold()).toBe(0.3)
  })

  // 6. recordAdoption でターン結果を記録
  it('recordAdoption で採用/不採用を記録できる', () => {
    threshold.recordAdoption(true)
    threshold.recordAdoption(false)
    threshold.recordAdoption(true)

    const stats = threshold.getStats()
    expect(stats.totalRecords).toBe(3)
  })

  // 7. 最大20件まで保持（FIFO: 古いものから削除）
  it('最大20件まで保持し、超過分はFIFOで削除する', () => {
    // 最初に20件のfalseを記録
    for (let i = 0; i < 20; i++) {
      threshold.recordAdoption(false)
    }
    expect(threshold.getStats().totalRecords).toBe(20)
    expect(threshold.getAdoptionRate()).toBe(0)

    // さらに15件のtrueを追加（古いfalse 15件が押し出される）
    for (let i = 0; i < 15; i++) {
      threshold.recordAdoption(true)
    }
    expect(threshold.getStats().totalRecords).toBe(20)
    // 残り: false 5件 + true 15件 = 75% 採用率
    expect(threshold.getAdoptionRate()).toBe(0.75)
    expect(threshold.getThreshold()).toBe(0.4)
  })

  // 8. getThreshold が正しい値を返す（境界値テスト）
  it('採用率が正確に70%の場合、閾値0.3を維持する（70%は中間範囲）', () => {
    // 20ターン中14採用 = 70%（ちょうど境界）
    for (let i = 0; i < 14; i++) {
      threshold.recordAdoption(true)
    }
    for (let i = 0; i < 6; i++) {
      threshold.recordAdoption(false)
    }

    // >70% ではないので0.3を維持
    expect(threshold.getThreshold()).toBe(0.3)
  })

  it('採用率が正確に30%の場合、閾値0.3を維持する（30%は中間範囲）', () => {
    // 20ターン中6採用 = 30%（ちょうど境界）
    for (let i = 0; i < 6; i++) {
      threshold.recordAdoption(true)
    }
    for (let i = 0; i < 14; i++) {
      threshold.recordAdoption(false)
    }

    // <30% ではないので0.3を維持
    expect(threshold.getThreshold()).toBe(0.3)
  })

  // 9. getStats が正しいオブジェクトを返す
  it('getStats が threshold, adoptionRate, totalRecords を返す', () => {
    for (let i = 0; i < 20; i++) {
      threshold.recordAdoption(i < 16) // 16/20 = 80%
    }

    const stats = threshold.getStats()
    expect(stats).toEqual({
      threshold: 0.4,
      adoptionRate: 0.8,
      totalRecords: 20,
    })
  })

  it('記録なしの場合、getStats が初期値を返す', () => {
    const stats = threshold.getStats()
    expect(stats).toEqual({
      threshold: 0.3,
      adoptionRate: 0,
      totalRecords: 0,
    })
  })

  // 10. reset で全記録クリア
  it('reset で全記録がクリアされ、デフォルト閾値に戻る', () => {
    for (let i = 0; i < 20; i++) {
      threshold.recordAdoption(true)
    }
    expect(threshold.getThreshold()).toBe(0.4)

    threshold.reset()

    expect(threshold.getThreshold()).toBe(0.3)
    expect(threshold.getStats().totalRecords).toBe(0)
    expect(threshold.getAdoptionRate()).toBe(0)
  })

  // getAdoptionRate の追加テスト
  it('getAdoptionRate が正しい採用率を返す', () => {
    threshold.recordAdoption(true)
    threshold.recordAdoption(true)
    threshold.recordAdoption(false)

    expect(threshold.getAdoptionRate()).toBeCloseTo(2 / 3)
  })

  it('記録なしの場合、getAdoptionRate が0を返す', () => {
    expect(threshold.getAdoptionRate()).toBe(0)
  })

  // イミュータビリティ: getStats が内部状態を公開しない
  it('getStats の戻り値を変更しても内部状態に影響しない', () => {
    threshold.recordAdoption(true)
    const stats = threshold.getStats()
    ;(stats as any).totalRecords = 999

    expect(threshold.getStats().totalRecords).toBe(1)
  })
})
