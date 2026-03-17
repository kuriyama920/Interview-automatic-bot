import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockCurrentPage = { value: 'dashboard' as string }

vi.mock('../../src/renderer/src/contexts/NavigationContext', () => ({
  useNavigation: () => ({
    currentPage: mockCurrentPage.value,
  }),
}))

vi.mock('../../src/renderer/src/components/layout/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}))

vi.mock('../../src/renderer/src/components/pages/DashboardPage', () => ({
  DashboardPage: () => <div data-testid="dashboard-page">DashboardPage</div>,
}))

vi.mock('../../src/renderer/src/components/pages/InterviewPage', () => ({
  InterviewPage: () => <div data-testid="interview-page">InterviewPage</div>,
}))

vi.mock('../../src/renderer/src/components/pages/DocumentsPage', () => ({
  DocumentsPage: () => <div data-testid="documents-page">DocumentsPage</div>,
}))

vi.mock('../../src/renderer/src/components/pages/QuestionsPage', () => ({
  QuestionsPage: () => <div data-testid="questions-page">QuestionsPage</div>,
}))

vi.mock('../../src/renderer/src/components/pages/ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-page">ProfilePage</div>,
}))

vi.mock('../../src/renderer/src/components/pages/SubscriptionPage', () => ({
  SubscriptionPage: () => <div data-testid="subscription-page">SubscriptionPage</div>,
}))

import { AppShell } from '../../src/renderer/src/components/layout/AppShell'

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentPage.value = 'dashboard'
  })

  it('should always render the Sidebar', () => {
    render(<AppShell />)
    expect(screen.getByTestId('sidebar')).toBeDefined()
  })

  it('should render DashboardPage when currentPage is dashboard', () => {
    mockCurrentPage.value = 'dashboard'
    render(<AppShell />)
    expect(screen.getByTestId('dashboard-page')).toBeDefined()
  })

  it('should render InterviewPage when currentPage is interview', () => {
    mockCurrentPage.value = 'interview'
    render(<AppShell />)
    expect(screen.getByTestId('interview-page')).toBeDefined()
  })

  it('should render DocumentsPage when currentPage is documents', () => {
    mockCurrentPage.value = 'documents'
    render(<AppShell />)
    expect(screen.getByTestId('documents-page')).toBeDefined()
  })

  it('should render QuestionsPage when currentPage is questions', () => {
    mockCurrentPage.value = 'questions'
    render(<AppShell />)
    expect(screen.getByTestId('questions-page')).toBeDefined()
  })

  it('should render ProfilePage when currentPage is profile', () => {
    mockCurrentPage.value = 'profile'
    render(<AppShell />)
    expect(screen.getByTestId('profile-page')).toBeDefined()
  })

  it('should render SubscriptionPage when currentPage is subscription', () => {
    mockCurrentPage.value = 'subscription'
    render(<AppShell />)
    expect(screen.getByTestId('subscription-page')).toBeDefined()
  })

  it('should not render other pages when dashboard is active', () => {
    mockCurrentPage.value = 'dashboard'
    render(<AppShell />)
    expect(screen.queryByTestId('interview-page')).toBeNull()
    expect(screen.queryByTestId('documents-page')).toBeNull()
    expect(screen.queryByTestId('questions-page')).toBeNull()
    expect(screen.queryByTestId('profile-page')).toBeNull()
    expect(screen.queryByTestId('subscription-page')).toBeNull()
  })

  it('should render main element wrapping page content', () => {
    render(<AppShell />)
    const main = screen.getByRole('main')
    expect(main).toBeDefined()
  })
})
