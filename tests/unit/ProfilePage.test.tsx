import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../src/renderer/src/components/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  ),
}))

vi.mock('../../src/renderer/src/components/ProfileTab', () => ({
  ProfileTab: () => <div data-testid="profile-tab">ProfileTab</div>,
}))

import { ProfilePage } from '../../src/renderer/src/components/pages/ProfilePage'

describe('ProfilePage', () => {
  it('should render the page header with correct title', () => {
    render(<ProfilePage />)
    expect(screen.getByText('プロフィール')).toBeDefined()
  })

  it('should render the page header with correct subtitle', () => {
    render(<ProfilePage />)
    expect(screen.getByText('面接プロフィール情報を設定して、AIの回答精度を向上')).toBeDefined()
  })

  it('should render the ProfileTab component', () => {
    render(<ProfilePage />)
    expect(screen.getByTestId('profile-tab')).toBeDefined()
  })

  it('should render the page header component', () => {
    render(<ProfilePage />)
    expect(screen.getByTestId('page-header')).toBeDefined()
  })
})
