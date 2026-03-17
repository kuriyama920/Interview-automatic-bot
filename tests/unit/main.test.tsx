import { describe, it, expect, vi } from 'vitest'

// Mock ReactDOM.createRoot
const mockRender = vi.fn()
vi.mock('react-dom/client', () => ({
  default: {
    createRoot: vi.fn(() => ({
      render: mockRender,
    })),
  },
}))

// Mock App component
vi.mock('../../src/renderer/src/App', () => ({
  default: () => <div>App</div>,
}))

// Mock ErrorBoundary
vi.mock('../../src/renderer/src/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock CSS import
vi.mock('../../src/renderer/src/index.css', () => ({}))

describe('main.tsx', () => {
  it('should be importable without errors', async () => {
    // Create a root element for the app to mount to
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)

    // Import main.tsx - this triggers the side effect of rendering
    await import('../../src/renderer/src/main')

    expect(mockRender).toHaveBeenCalled()

    // Cleanup
    document.body.removeChild(root)
  })
})
