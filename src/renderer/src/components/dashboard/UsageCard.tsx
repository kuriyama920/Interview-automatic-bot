/**
 * 使用量メトリクスカード
 */

import type { ReactNode } from 'react'

interface UsageCardProps {
  icon: ReactNode
  label: string
  used: number
  limit: number
  unit: string
}

export function UsageCard({ icon, label, used, limit, unit }: UsageCardProps) {
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isWarning = percentage >= 80
  const isDanger = percentage >= 95

  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-content-secondary">{icon}</span>
        <span className="text-xs font-medium text-content-secondary">{label}</span>
      </div>

      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-xl font-bold text-content">{used.toLocaleString()}</span>
        <span className="text-xs text-content-tertiary">
          / {isUnlimited ? '無制限' : `${limit.toLocaleString()} ${unit}`}
        </span>
      </div>

      {!isUnlimited && (
        <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isDanger ? 'bg-error' : isWarning ? 'bg-warning' : 'bg-accent'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
