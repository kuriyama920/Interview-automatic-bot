import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginPage } from '../../src/renderer/src/components/LoginPage'

describe('LoginPage', () => {
  const defaultProps = {
    onLogin: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null as string | null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the app title', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByText('Interview Bot')).toBeDefined()
  })

  it('should render Google login button', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByText('Googleでログイン')).toBeDefined()
  })

  it('should call onLogin when Google button is clicked', async () => {
    render(<LoginPage {...defaultProps} />)
    fireEvent.click(screen.getByText('Googleでログイン'))
    await waitFor(() => {
      expect(defaultProps.onLogin).toHaveBeenCalledTimes(1)
    })
  })

  it('should disable button when loading', () => {
    render(<LoginPage {...defaultProps} isLoading={true} />)
    // When isLoading=true, Button component renders Spinner instead of text
    // and sets disabled=true. Find the button by role.
    const buttons = screen.getAllByRole('button')
    const loginButton = buttons.find(btn => btn.className.includes('w-full'))
    expect(loginButton?.disabled).toBe(true)
  })

  it('should display error message when error prop is set', () => {
    render(<LoginPage {...defaultProps} error="認証に失敗しました" />)
    expect(screen.getByText('認証に失敗しました')).toBeDefined()
  })

  it('should not display error when error is null', () => {
    render(<LoginPage {...defaultProps} error={null} />)
    expect(screen.queryByText('認証に失敗しました')).toBeNull()
  })

  it('should render feature list', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByText('機能紹介')).toBeDefined()
  })

  it('should render feature items', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByText('リアルタイム音声認識')).toBeDefined()
    expect(screen.getByText('AIによる回答提案')).toBeDefined()
  })

  it('should render privacy and terms links', () => {
    render(<LoginPage {...defaultProps} />)
    expect(screen.getByText(/利用規約/)).toBeDefined()
    expect(screen.getByText(/プライバシーポリシー/)).toBeDefined()
  })
})
