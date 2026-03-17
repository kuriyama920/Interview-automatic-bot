import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import React from 'react'
import { NavigationProvider, useNavigation } from '../../src/renderer/src/contexts/NavigationContext'
import type { PageId } from '../../src/renderer/src/contexts/NavigationContext'

function TestConsumer() {
  const {
    currentPage,
    previousPage,
    sidebarCollapsed,
    isRecording,
    navigateTo,
    toggleSidebar,
    setSidebarCollapsed,
    setIsRecording,
  } = useNavigation()

  return (
    <div>
      <span data-testid="currentPage">{currentPage}</span>
      <span data-testid="previousPage">{previousPage ?? 'null'}</span>
      <span data-testid="sidebarCollapsed">{String(sidebarCollapsed)}</span>
      <span data-testid="isRecording">{String(isRecording)}</span>
      <button onClick={() => navigateTo('interview')} data-testid="navInterview">interview</button>
      <button onClick={() => navigateTo('documents')} data-testid="navDocuments">documents</button>
      <button onClick={toggleSidebar} data-testid="toggleSidebar">toggle</button>
      <button onClick={() => setSidebarCollapsed(true)} data-testid="collapse">collapse</button>
      <button onClick={() => setSidebarCollapsed(false)} data-testid="expand">expand</button>
      <button onClick={() => setIsRecording(true)} data-testid="startRecording">startRecording</button>
      <button onClick={() => setIsRecording(false)} data-testid="stopRecording">stopRecording</button>
    </div>
  )
}

describe('NavigationContext', () => {
  function renderWithProvider() {
    return render(
      <NavigationProvider>
        <TestConsumer />
      </NavigationProvider>
    )
  }

  it('should provide initial state', () => {
    renderWithProvider()
    expect(screen.getByTestId('currentPage').textContent).toBe('dashboard')
    expect(screen.getByTestId('previousPage').textContent).toBe('null')
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
    expect(screen.getByTestId('isRecording').textContent).toBe('false')
  })

  it('should throw error when useNavigation used outside provider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => {
      render(<TestConsumer />)
    }).toThrow('useNavigation must be used within NavigationProvider')
    consoleSpy.mockRestore()
  })

  it('should navigate to a page and update previousPage', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('navInterview'))
    expect(screen.getByTestId('currentPage').textContent).toBe('interview')
    expect(screen.getByTestId('previousPage').textContent).toBe('dashboard')
  })

  it('should collapse sidebar when navigating to interview', () => {
    renderWithProvider()
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
    fireEvent.click(screen.getByTestId('navInterview'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('true')
  })

  it('should not collapse sidebar when navigating to non-interview page', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('navDocuments'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
  })

  it('should toggle sidebar', () => {
    renderWithProvider()
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
    fireEvent.click(screen.getByTestId('toggleSidebar'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('true')
    fireEvent.click(screen.getByTestId('toggleSidebar'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
  })

  it('should set sidebar collapsed', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('collapse'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('true')
    fireEvent.click(screen.getByTestId('expand'))
    expect(screen.getByTestId('sidebarCollapsed').textContent).toBe('false')
  })

  it('should set isRecording', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('startRecording'))
    expect(screen.getByTestId('isRecording').textContent).toBe('true')
    fireEvent.click(screen.getByTestId('stopRecording'))
    expect(screen.getByTestId('isRecording').textContent).toBe('false')
  })

  it('should handle Ctrl+1 shortcut to navigate to dashboard', () => {
    renderWithProvider()
    fireEvent.click(screen.getByTestId('navInterview'))
    expect(screen.getByTestId('currentPage').textContent).toBe('interview')

    act(() => {
      fireEvent.keyDown(window, { key: '1', ctrlKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('dashboard')
  })

  it('should handle Ctrl+2 shortcut to navigate to interview', () => {
    renderWithProvider()
    act(() => {
      fireEvent.keyDown(window, { key: '2', ctrlKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('interview')
  })

  it('should handle Ctrl+3 shortcut to navigate to documents', () => {
    renderWithProvider()
    act(() => {
      fireEvent.keyDown(window, { key: '3', ctrlKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('documents')
  })

  it('should not navigate when Shift is held with Ctrl', () => {
    renderWithProvider()
    act(() => {
      fireEvent.keyDown(window, { key: '1', ctrlKey: true, shiftKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('dashboard')
  })

  it('should not navigate when Alt is held with Ctrl', () => {
    renderWithProvider()
    act(() => {
      fireEvent.keyDown(window, { key: '1', ctrlKey: true, altKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('dashboard')
  })

  it('should not navigate for Ctrl+7 (out of range)', () => {
    renderWithProvider()
    act(() => {
      fireEvent.keyDown(window, { key: '7', ctrlKey: true })
    })
    expect(screen.getByTestId('currentPage').textContent).toBe('dashboard')
  })
})
