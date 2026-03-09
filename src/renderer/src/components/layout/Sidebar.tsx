/**
 * サイドバーナビゲーション
 * Full (w-60) / Collapsed (w-16) モード
 */

import { useNavigation, type PageId } from '../../contexts/NavigationContext'
import { useAuth } from '../../hooks/useAuth'
import { Avatar, Badge } from '../ui'
import { MicrophoneIcon } from '../ui/icons'
import { SidebarItem } from './SidebarItem'

// アイコンコンポーネント
const HomeIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
)

const MessageIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
)

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
  </svg>
)

const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
  </svg>
)

const LogoutIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
  </svg>
)

const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
  </svg>
)

interface NavItem {
  id: PageId
  label: string
  icon: React.ReactNode
}

const mainNavItems: NavItem[] = [
  { id: 'dashboard', label: 'ダッシュボード', icon: <HomeIcon /> },
  { id: 'interview', label: '面接モード', icon: <MicrophoneIcon /> },
  { id: 'documents', label: '資料管理', icon: <FolderIcon /> },
  { id: 'questions', label: '想定質問', icon: <MessageIcon /> },
]

const secondaryNavItems: NavItem[] = [
  { id: 'profile', label: 'プロフィール', icon: <UserIcon /> },
  { id: 'subscription', label: 'プラン', icon: <CreditCardIcon /> },
]

export function Sidebar() {
  const { currentPage, sidebarCollapsed, isRecording, navigateTo, toggleSidebar } = useNavigation()
  const { user, logout } = useAuth()

  const tierLabel = user?.subscriptionTier === 'pro' ? 'Pro' : user?.subscriptionTier === 'max' ? 'Max' : 'Free'
  const tierVariant = user?.subscriptionTier === 'free' ? 'default' as const : 'success' as const

  return (
    <aside
      className={`${
        sidebarCollapsed ? 'w-16' : 'w-60'
      } h-full flex flex-col bg-surface border-r border-border/50 transition-all duration-200 flex-shrink-0`}
    >
      {/* ナビゲーション */}
      <nav className="flex-1 p-2 space-y-1">
        {/* メインナビ */}
        {mainNavItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={currentPage === item.id}
            isCollapsed={sidebarCollapsed}
            onClick={() => navigateTo(item.id)}
            badge={
              item.id === 'interview' && isRecording ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
                </span>
              ) : undefined
            }
          />
        ))}

        {/* セパレータ */}
        <div className="my-2 border-t border-border/50" />

        {/* セカンダリナビ */}
        {secondaryNavItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            isActive={currentPage === item.id}
            isCollapsed={sidebarCollapsed}
            onClick={() => navigateTo(item.id)}
          />
        ))}
      </nav>

      {/* ユーザー情報 + アクション */}
      <div className="border-t border-border/50 p-2 space-y-1">
        {/* ユーザー情報 */}
        {!sidebarCollapsed && user && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <Avatar src={user.picture} name={user.name || user.email} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-content truncate">{user.name || user.email}</p>
                <Badge variant={tierVariant} size="sm" className="mt-0.5">
                  {tierLabel}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {sidebarCollapsed && user && (
          <div className="flex justify-center py-1">
            <Avatar src={user.picture} name={user.name || user.email} size="sm" />
          </div>
        )}

        {/* ログアウト */}
        <button
          onClick={logout}
          className={`group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-content-secondary hover:text-error hover:bg-error-subtle transition-colors ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
          title={sidebarCollapsed ? 'ログアウト' : undefined}
        >
          <LogoutIcon />
          {!sidebarCollapsed && <span>ログアウト</span>}
          {sidebarCollapsed && (
            <span className="absolute left-full ml-2 px-2 py-1 bg-neutral text-neutral-content text-xs rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-elevated">
              ログアウト
            </span>
          )}
        </button>

        {/* 折りたたみトグル */}
        <button
          onClick={toggleSidebar}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs text-content-tertiary hover:text-content-secondary hover:bg-surface-hover transition-colors ${
            sidebarCollapsed ? 'justify-center' : ''
          }`}
          title={sidebarCollapsed ? '展開' : '折りたたむ'}
        >
          <CollapseIcon collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && <span>折りたたむ</span>}
        </button>
      </div>
    </aside>
  )
}
