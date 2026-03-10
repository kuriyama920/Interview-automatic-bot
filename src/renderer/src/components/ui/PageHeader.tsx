/**
 * ページヘッダー共通コンポーネント
 * タイトル + サブタイトル + アクションエリア
 */

import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-surface">
      <div>
        <h1 className="text-lg font-semibold text-content">{title}</h1>
        {subtitle && (
          <p className="text-sm text-content-secondary mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}
