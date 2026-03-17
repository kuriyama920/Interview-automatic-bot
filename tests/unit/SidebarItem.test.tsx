import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SidebarItem } from '../../src/renderer/src/components/layout/SidebarItem'

describe('SidebarItem', () => {
  const defaultProps = {
    icon: <span data-testid="icon">icon</span>,
    label: 'テストラベル',
    isActive: false,
    isCollapsed: false,
    onClick: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the label when not collapsed', () => {
    render(<SidebarItem {...defaultProps} />)
    expect(screen.getByText('テストラベル')).toBeDefined()
  })

  it('should render the icon', () => {
    render(<SidebarItem {...defaultProps} />)
    expect(screen.getByTestId('icon')).toBeDefined()
  })

  it('should call onClick when clicked', () => {
    render(<SidebarItem {...defaultProps} />)
    fireEvent.click(screen.getByRole('button'))
    expect(defaultProps.onClick).toHaveBeenCalledTimes(1)
  })

  it('should set aria-current to page when active', () => {
    render(<SidebarItem {...defaultProps} isActive={true} />)
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('page')
  })

  it('should not set aria-current when not active', () => {
    render(<SidebarItem {...defaultProps} isActive={false} />)
    expect(screen.getByRole('button').getAttribute('aria-current')).toBeNull()
  })

  it('should hide label text when collapsed', () => {
    render(<SidebarItem {...defaultProps} isCollapsed={true} />)
    // The label is still rendered as a tooltip, but the inline text span is not shown
    // queryByText finds the tooltip text (which exists in collapsed mode)
    const buttons = screen.getAllByText('テストラベル')
    // In collapsed mode, only the tooltip span shows the label
    expect(buttons.length).toBe(1)
  })

  it('should show tooltip with label when collapsed', () => {
    render(<SidebarItem {...defaultProps} isCollapsed={true} />)
    // The tooltip span should exist with the label text
    expect(screen.getByText('テストラベル')).toBeDefined()
  })

  it('should set title attribute when collapsed', () => {
    render(<SidebarItem {...defaultProps} isCollapsed={true} />)
    expect(screen.getByRole('button').getAttribute('title')).toBe('テストラベル')
  })

  it('should not set title attribute when not collapsed', () => {
    render(<SidebarItem {...defaultProps} isCollapsed={false} />)
    expect(screen.getByRole('button').getAttribute('title')).toBeNull()
  })

  it('should render badge when provided and not collapsed', () => {
    render(
      <SidebarItem
        {...defaultProps}
        badge={<span data-testid="badge">badge</span>}
      />
    )
    expect(screen.getByTestId('badge')).toBeDefined()
  })

  it('should not render badge when collapsed', () => {
    render(
      <SidebarItem
        {...defaultProps}
        isCollapsed={true}
        badge={<span data-testid="badge">badge</span>}
      />
    )
    expect(screen.queryByTestId('badge')).toBeNull()
  })

  it('should apply active styles when isActive is true', () => {
    render(<SidebarItem {...defaultProps} isActive={true} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-accent-subtle')
  })

  it('should apply inactive styles when isActive is false', () => {
    render(<SidebarItem {...defaultProps} isActive={false} />)
    const button = screen.getByRole('button')
    expect(button.className).toContain('text-content-secondary')
  })
})
