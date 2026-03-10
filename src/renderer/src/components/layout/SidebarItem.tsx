/**
 * サイドバー個別ナビアイテム
 */

import type { ReactNode } from 'react'

interface SidebarItemProps {
  icon: ReactNode
  label: string
  isActive: boolean
  isCollapsed: boolean
  onClick: () => void
  badge?: ReactNode
}

export function SidebarItem({ icon, label, isActive, isCollapsed, onClick, badge }: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? 'bg-accent-subtle text-accent border-l-[3px] border-accent pl-[9px]'
          : 'text-content-secondary hover:bg-surface-hover hover:text-content border-l-[3px] border-transparent pl-[9px]'
      }`}
      title={isCollapsed ? label : undefined}
    >
      <span className="flex-shrink-0 w-5 h-5">{icon}</span>

      {!isCollapsed && (
        <>
          <span className="truncate">{label}</span>
          {badge && <span className="ml-auto">{badge}</span>}
        </>
      )}

      {/* ツールチップ（collapsed時） */}
      {isCollapsed && (
        <span className="absolute left-full ml-2 px-2 py-1 bg-neutral text-neutral-content text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-elevated">
          {label}
        </span>
      )}
    </button>
  )
}
