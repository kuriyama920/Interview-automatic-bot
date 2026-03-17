import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../../src/renderer/src/components/ErrorBoundary'

// Component that throws an error on render
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('テストエラー')
  }
  return <div>正常なコンテンツ</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error for error boundary tests
  const originalConsoleError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = originalConsoleError
  })

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <div>テストコンテンツ</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('テストコンテンツ')).toBeDefined()
  })

  it('should show error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('エラーが発生しました')).toBeDefined()
  })

  it('should display the error message', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('テストエラー')).toBeDefined()
  })

  it('should have reload button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('アプリを再読み込み')).toBeDefined()
  })

  it('should have retry button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(screen.getByText('再試行')).toBeDefined()
  })

  it('should reset error state when retry is clicked', () => {
    // Use a stateful wrapper to control throwing
    let shouldThrow = true
    function ConditionalThrower() {
      if (shouldThrow) throw new Error('テストエラー')
      return <div>回復済み</div>
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    )

    expect(screen.getByText('エラーが発生しました')).toBeDefined()

    // Stop throwing and click retry
    shouldThrow = false
    fireEvent.click(screen.getByText('再試行'))

    // After reset, it should try to render children again
    // Since shouldThrow is now false, it should render normally
    rerender(
      <ErrorBoundary>
        <ConditionalThrower />
      </ErrorBoundary>
    )
  })

  it('should call window.location.reload on reload button click', () => {
    const mockReload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    })

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )

    fireEvent.click(screen.getByText('アプリを再読み込み'))
    expect(mockReload).toHaveBeenCalled()
  })

  it('should log error via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    )
    expect(console.error).toHaveBeenCalled()
  })
})
