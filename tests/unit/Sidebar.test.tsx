import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockNavigateTo = vi.fn()
const mockToggleSidebar = vi.fn()
const mockLogout = vi.fn()

const mockNavigationState = {
  currentPage: 'dashboard' as string,
  sidebarCollapsed: false,
  isRecording: false,
  navigateTo: mockNavigateTo,
  toggleSidebar: mockToggleSidebar,
}

const mockAuthState = {
  user: null as null | { name: string; email: string; picture?: string; subscriptionTier: string },
  logout: mockLogout,
}

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  useNavigation: () => mockNavigationState,
}))

vi.mock('../../src/renderer/src/hooks/useAuth', () => ({
  useAuth: () => mockAuthState,
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Avatar: ({ name }: { name?: string }) => <span data-testid="avatar">{name}</span>,
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  MicrophoneIcon: () => <span data-testid="microphone-icon">mic</span>,
}))

vi.mock('../../src/renderer/src/components/layout/SidebarItem', () => ({
  SidebarItem: ({ label, onClick, isActive }: { label: string; onClick: () => void; isActive: boolean }) => (
    <button data-testid={`sidebar-item-${label}`} onClick={onClick} data-active={isActive}>
      {label}
    </button>
  ),
}))

import { Sidebar } from '../../src/renderer/src/components/layout/Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigationState.currentPage = 'dashboard'
    mockNavigationState.sidebarCollapsed = false
    mockNavigationState.isRecording = false
    mockAuthState.user = null
  })

  it('should render main navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('ダッシュボード')).toBeDefined()
    expect(screen.getByText('面接モード')).toBeDefined()
    expect(screen.getByText('資料管理')).toBeDefined()
    expect(screen.getByText('想定質問')).toBeDefined()
  })

  it('should render secondary navigation items', () => {
    render(<Sidebar />)
    expect(screen.getByText('プロフィール')).toBeDefined()
    expect(screen.getByText('プラン')).toBeDefined()
  })

  it('should navigate to dashboard when dashboard item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-ダッシュボード'))
    expect(mockNavigateTo).toHaveBeenCalledWith('dashboard')
  })

  it('should navigate to interview when interview item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-面接モード'))
    expect(mockNavigateTo).toHaveBeenCalledWith('interview')
  })

  it('should navigate to documents when documents item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-資料管理'))
    expect(mockNavigateTo).toHaveBeenCalledWith('documents')
  })

  it('should navigate to questions when questions item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-想定質問'))
    expect(mockNavigateTo).toHaveBeenCalledWith('questions')
  })

  it('should navigate to profile when profile item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-プロフィール'))
    expect(mockNavigateTo).toHaveBeenCalledWith('profile')
  })

  it('should navigate to subscription when plan item is clicked', () => {
    render(<Sidebar />)
    fireEvent.click(screen.getByTestId('sidebar-item-プラン'))
    expect(mockNavigateTo).toHaveBeenCalledWith('subscription')
  })

  it('should call logout when logout button is clicked', () => {
    render(<Sidebar />)
    const logoutButton = screen.getByText('ログアウト').closest('button')!
    fireEvent.click(logoutButton)
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('should call toggleSidebar when collapse button is clicked', () => {
    render(<Sidebar />)
    const collapseButton = screen.getByText('折りたたむ').closest('button')!
    fireEvent.click(collapseButton)
    expect(mockToggleSidebar).toHaveBeenCalledTimes(1)
  })

  it('should display user info when user is logged in and sidebar expanded', () => {
    mockAuthState.user = {
      name: 'テストユーザー',
      email: 'test@example.com',
      picture: 'https://example.com/pic.jpg',
      subscriptionTier: 'free',
    }
    render(<Sidebar />)
    const elements = screen.getAllByText('テストユーザー')
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('should show Free badge for free tier user', () => {
    mockAuthState.user = {
      name: 'テスト',
      email: 'test@example.com',
      subscriptionTier: 'free',
    }
    render(<Sidebar />)
    expect(screen.getByText('Free')).toBeDefined()
  })

  it('should show Pro badge for pro tier user', () => {
    mockAuthState.user = {
      name: 'テスト',
      email: 'test@example.com',
      subscriptionTier: 'pro',
    }
    render(<Sidebar />)
    expect(screen.getByText('Pro')).toBeDefined()
  })

  it('should show Max badge for max tier user', () => {
    mockAuthState.user = {
      name: 'テスト',
      email: 'test@example.com',
      subscriptionTier: 'max',
    }
    render(<Sidebar />)
    expect(screen.getByText('Max')).toBeDefined()
  })

  it('should display email when user has no name', () => {
    mockAuthState.user = {
      name: '',
      email: 'test@example.com',
      subscriptionTier: 'free',
    }
    render(<Sidebar />)
    const elements = screen.getAllByText('test@example.com')
    expect(elements.length).toBeGreaterThanOrEqual(1)
  })

  it('should not show user info when user is null', () => {
    mockAuthState.user = null
    render(<Sidebar />)
    expect(screen.queryByTestId('avatar')).toBeNull()
  })

  it('should have w-60 class when not collapsed', () => {
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')
    expect(aside?.className).toContain('w-60')
  })

  it('should have w-16 class when collapsed', () => {
    mockNavigationState.sidebarCollapsed = true
    const { container } = render(<Sidebar />)
    const aside = container.querySelector('aside')
    expect(aside?.className).toContain('w-16')
  })

  it('should hide logout text when collapsed', () => {
    mockNavigationState.sidebarCollapsed = true
    render(<Sidebar />)
    // In collapsed mode, the logout span is not rendered but there is a tooltip span
    const logoutTexts = screen.getAllByText('ログアウト')
    // One for the tooltip
    expect(logoutTexts.length).toBe(1)
  })

  it('should show avatar when user exists and sidebar is collapsed', () => {
    mockNavigationState.sidebarCollapsed = true
    mockAuthState.user = {
      name: 'テスト',
      email: 'test@example.com',
      subscriptionTier: 'free',
    }
    render(<Sidebar />)
    expect(screen.getByTestId('avatar')).toBeDefined()
  })
})
