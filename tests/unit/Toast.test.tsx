import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToastContainer } from '../../src/renderer/src/components/Toast'
import type { ToastData } from '../../src/renderer/src/components/Toast'

// Toast is not exported (internal component), so we test it via ToastContainer

describe('ToastContainer', () => {
  const mockOnClose = vi.fn()

  const defaultToast: ToastData = {
    id: 'toast-1',
    type: 'success',
    message: 'テスト成功メッセージ',
    duration: 4000,
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return null when no toasts', () => {
    const { container } = render(<ToastContainer toasts={[]} onClose={mockOnClose} />)
    expect(container.innerHTML).toBe('')
  })

  it('should render toast message', () => {
    render(<ToastContainer toasts={[defaultToast]} onClose={mockOnClose} />)
    expect(screen.getByText('テスト成功メッセージ')).toBeDefined()
  })

  it('should have role="alert" for accessibility', () => {
    render(<ToastContainer toasts={[defaultToast]} onClose={mockOnClose} />)
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('should call onClose when close button is clicked', () => {
    render(<ToastContainer toasts={[defaultToast]} onClose={mockOnClose} />)
    const closeButton = screen.getByLabelText('閉じる')
    fireEvent.click(closeButton)
    expect(mockOnClose).toHaveBeenCalledWith('toast-1')
  })

  it('should auto-close after duration', () => {
    render(<ToastContainer toasts={[defaultToast]} onClose={mockOnClose} />)
    expect(mockOnClose).not.toHaveBeenCalled()

    vi.advanceTimersByTime(4000)
    expect(mockOnClose).toHaveBeenCalledWith('toast-1')
  })

  it('should not auto-close if duration is 0', () => {
    const toast = { ...defaultToast, duration: 0 }
    render(<ToastContainer toasts={[toast]} onClose={mockOnClose} />)
    vi.advanceTimersByTime(10000)
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('should render error type toast', () => {
    const errorToast: ToastData = { ...defaultToast, type: 'error', message: 'エラー発生' }
    render(<ToastContainer toasts={[errorToast]} onClose={mockOnClose} />)
    expect(screen.getByText('エラー発生')).toBeDefined()
  })

  it('should render warning type toast', () => {
    const warningToast: ToastData = { ...defaultToast, type: 'warning', message: '警告メッセージ' }
    render(<ToastContainer toasts={[warningToast]} onClose={mockOnClose} />)
    expect(screen.getByText('警告メッセージ')).toBeDefined()
  })

  it('should render info type toast', () => {
    const infoToast: ToastData = { ...defaultToast, type: 'info', message: 'お知らせ' }
    render(<ToastContainer toasts={[infoToast]} onClose={mockOnClose} />)
    expect(screen.getByText('お知らせ')).toBeDefined()
  })

  it('should render multiple toasts', () => {
    const toasts: ToastData[] = [
      { id: '1', type: 'success', message: 'メッセージ1' },
      { id: '2', type: 'error', message: 'メッセージ2' },
    ]
    render(<ToastContainer toasts={toasts} onClose={mockOnClose} />)
    expect(screen.getByText('メッセージ1')).toBeDefined()
    expect(screen.getByText('メッセージ2')).toBeDefined()
  })

  it('should render in fixed position container', () => {
    const toasts: ToastData[] = [
      { id: '1', type: 'info', message: 'テスト' },
    ]
    const { container } = render(<ToastContainer toasts={toasts} onClose={mockOnClose} />)
    const wrapper = container.firstElementChild
    expect(wrapper?.className).toContain('fixed')
  })
})
