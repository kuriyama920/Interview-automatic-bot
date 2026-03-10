/**
 * カスタムタイトルバー
 * Electron ウィンドウコントロール
 */

import appIcon from '../../assets/icon.svg'

export function TitleBar() {
  const handleMinimize = () => window.electron.window.minimize()
  const handleMaximize = () => window.electron.window.maximize()
  const handleClose = () => window.electron.window.close()

  return (
    <div className="flex items-center h-8 bg-surface border-b border-border/50 select-none drag-region shrink-0">
      <div className="flex items-center gap-1.5 px-3">
        <img src={appIcon} alt="" className="w-4 h-4 no-drag" />
        <span className="text-[11px] font-medium text-content-secondary">Interview Bot</span>
      </div>

      <div className="flex-1" />

      <div className="flex h-full no-drag">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-surface-hover transition-colors"
          aria-label="最小化"
        >
          <svg className="w-3 h-3 text-content-secondary" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-surface-hover transition-colors"
          aria-label="最大化"
        >
          <svg className="w-3 h-3 text-content-secondary" viewBox="0 0 12 12">
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-content-secondary transition-colors"
          aria-label="閉じる"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
