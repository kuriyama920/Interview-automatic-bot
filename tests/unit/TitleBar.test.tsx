import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TitleBar } from '../../src/renderer/src/components/layout/TitleBar'

describe('TitleBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the app title text', () => {
    render(<TitleBar />)
    expect(screen.getByText('Interview Bot')).toBeDefined()
  })

  it('should render minimize button with correct aria-label', () => {
    render(<TitleBar />)
    expect(screen.getByLabelText('最小化')).toBeDefined()
  })

  it('should render maximize button with correct aria-label', () => {
    render(<TitleBar />)
    expect(screen.getByLabelText('最大化')).toBeDefined()
  })

  it('should render close button with correct aria-label', () => {
    render(<TitleBar />)
    expect(screen.getByLabelText('閉じる')).toBeDefined()
  })

  it('should call window.electron.window.minimize on minimize click', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('最小化'))
    expect(window.electron.window.minimize).toHaveBeenCalledTimes(1)
  })

  it('should call window.electron.window.maximize on maximize click', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('最大化'))
    expect(window.electron.window.maximize).toHaveBeenCalledTimes(1)
  })

  it('should call window.electron.window.close on close click', () => {
    render(<TitleBar />)
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(window.electron.window.close).toHaveBeenCalledTimes(1)
  })

  it('should render the app icon image', () => {
    render(<TitleBar />)
    const img = screen.getByRole('img')
    expect(img).toBeDefined()
  })
})
