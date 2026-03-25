/**
 * AdaptiveThreshold - Speculative採用率ベースの閾値動的調整
 *
 * 直近20ターンの採用率に応じて changeRateThreshold を自動調整:
 * - 採用率 >70%: 0.4 に緩和（品質が安定しているため許容幅を広げる）
 * - 採用率 <30%: 0.2 に厳格化（品質が不安定なため厳しく判定）
 * - 中間 (30-70%): 0.3 を維持（デフォルト）
 */

const DEFAULT_THRESHOLD = 0.3
const HIGH_ADOPTION_THRESHOLD = 0.4
const LOW_ADOPTION_THRESHOLD = 0.2
const WINDOW_SIZE = 20
const HIGH_RATE = 0.7
const LOW_RATE = 0.3

export interface AdaptiveThresholdStats {
  threshold: number
  adoptionRate: number
  totalRecords: number
}

export class AdaptiveThreshold {
  private records: boolean[] = []

  /** 採用/不採用の結果を記録（FIFO: WINDOW_SIZE超過時は古いものから削除） */
  recordAdoption(adopted: boolean): void {
    const updated = [...this.records, adopted]
    this.records = updated.length > WINDOW_SIZE ? updated.slice(updated.length - WINDOW_SIZE) : updated
  }

  /** 現在の採用率を取得（0-1） */
  getAdoptionRate(): number {
    if (this.records.length === 0) return 0
    const adoptedCount = this.records.filter((r) => r).length
    return adoptedCount / this.records.length
  }

  /** 現在の動的閾値を取得 */
  getThreshold(): number {
    if (this.records.length < WINDOW_SIZE) {
      return DEFAULT_THRESHOLD
    }

    const rate = this.getAdoptionRate()

    if (rate > HIGH_RATE) {
      return HIGH_ADOPTION_THRESHOLD
    }
    if (rate < LOW_RATE) {
      return LOW_ADOPTION_THRESHOLD
    }
    return DEFAULT_THRESHOLD
  }

  /** 統計情報を取得 */
  getStats(): AdaptiveThresholdStats {
    return {
      threshold: this.getThreshold(),
      adoptionRate: this.getAdoptionRate(),
      totalRecords: this.records.length,
    }
  }

  /** 全記録をクリアしてデフォルトに戻す */
  reset(): void {
    this.records = []
  }
}
