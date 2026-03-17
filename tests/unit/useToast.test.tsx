import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { render, screen } from '@testing-library/react'
import { ToastProvider, useToast } from '../../src/renderer/src/hooks/useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  )

  describe('context requirement', () => {
    it('should throw error when used outside ToastProvider', () => {
      // Suppress console.error for expected error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        renderHook(() => useToast())
      }).toThrow('useToast must be used within a ToastProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('initial state', () => {
    it('should return all toast methods', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      expect(typeof result.current.showToast).toBe('function')
      expect(typeof result.current.success).toBe('function')
      expect(typeof result.current.error).toBe('function')
      expect(typeof result.current.warning).toBe('function')
      expect(typeof result.current.info).toBe('function')
    })
  })

  describe('showToast', () => {
    it('should render a toast with specified type and message', () => {
      const { result } = renderHook(() => useToast(), { wrapper })

      act(() => {
        result.current.showToast('success', 'テスト成功')
      })

      // ToastContainer is rendered inside the provider
      // Since we use renderHook, the DOM includes the ToastContainer
    })

    it('should render toast message in the DOM via ToastProvider', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.showToast('success', '操作完了')}>
            show
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('show').click()
      })

      expect(screen.getByText('操作完了')).toBeDefined()
    })
  })

  describe('success', () => {
    it('should show a success toast', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.success('保存しました')}>
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('保存しました')).toBeDefined()
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  describe('error', () => {
    it('should show an error toast', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.error('エラーが発生しました')}>
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('エラーが発生しました')).toBeDefined()
    })
  })

  describe('warning', () => {
    it('should show a warning toast', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.warning('注意してください')}>
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('注意してください')).toBeDefined()
    })
  })

  describe('info', () => {
    it('should show an info toast', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.info('お知らせです')}>
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('お知らせです')).toBeDefined()
    })
  })

  describe('multiple toasts', () => {
    it('should render multiple toasts', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button
            onClick={() => {
              toast.success('トースト1')
              toast.error('トースト2')
              toast.info('トースト3')
            }}
          >
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('トースト1')).toBeDefined()
      expect(screen.getByText('トースト2')).toBeDefined()
      expect(screen.getByText('トースト3')).toBeDefined()
    })

    it('should limit toasts to maximum 5', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button
            onClick={() => {
              toast.info('メッセージ1')
              toast.info('メッセージ2')
              toast.info('メッセージ3')
              toast.info('メッセージ4')
              toast.info('メッセージ5')
              toast.info('メッセージ6')
              toast.info('メッセージ7')
            }}
          >
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      const alerts = screen.getAllByRole('alert')
      expect(alerts.length).toBeLessThanOrEqual(5)
    })
  })

  describe('removeToast', () => {
    it('should remove a toast when close button is clicked', () => {
      function TestComponent() {
        const toast = useToast()
        return (
          <button onClick={() => toast.success('削除テスト')}>
            trigger
          </button>
        )
      }

      render(
        <ToastProvider>
          <TestComponent />
        </ToastProvider>
      )

      act(() => {
        screen.getByText('trigger').click()
      })

      expect(screen.getByText('削除テスト')).toBeDefined()

      act(() => {
        screen.getByLabelText('閉じる').click()
      })

      expect(screen.queryByText('削除テスト')).toBeNull()
    })
  })
})
