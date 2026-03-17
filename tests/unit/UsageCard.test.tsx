import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UsageCard } from '../../src/renderer/src/components/dashboard/UsageCard'

describe('UsageCard', () => {
  const defaultProps = {
    icon: <span data-testid="test-icon">icon</span>,
    label: 'STT使用量',
    used: 15,
    limit: 30,
    unit: '分',
  }

  it('should render label and icon', () => {
    render(<UsageCard {...defaultProps} />)
    expect(screen.getByText('STT使用量')).toBeDefined()
    expect(screen.getByTestId('test-icon')).toBeDefined()
  })

  it('should display used and limit values', () => {
    render(<UsageCard {...defaultProps} />)
    expect(screen.getByText('15')).toBeDefined()
    expect(screen.getByText(/30\s*分/)).toBeDefined()
  })

  it('should show progress bar with correct percentage', () => {
    const { container } = render(<UsageCard {...defaultProps} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar).toBeDefined()
    expect(progressBar?.getAttribute('style')).toContain('50%')
  })

  it('should cap percentage at 100%', () => {
    const { container } = render(<UsageCard {...defaultProps} used={50} limit={30} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.getAttribute('style')).toContain('100%')
  })

  it('should show warning color when usage >= 80%', () => {
    const { container } = render(<UsageCard {...defaultProps} used={25} limit={30} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.className).toContain('warning')
  })

  it('should show danger color when usage >= 95%', () => {
    const { container } = render(<UsageCard {...defaultProps} used={29} limit={30} />)
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.className).toContain('error')
  })

  it('should handle unlimited (limit = -1)', () => {
    render(<UsageCard {...defaultProps} limit={-1} />)
    expect(screen.getByText(/無制限/)).toBeDefined()
  })

  it('should handle zero usage', () => {
    const { container } = render(<UsageCard {...defaultProps} used={0} />)
    expect(screen.getByText('0')).toBeDefined()
    const progressBar = container.querySelector('[style*="width"]')
    expect(progressBar?.getAttribute('style')).toContain('0%')
  })
})
