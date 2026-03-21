import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  MicrophoneIcon,
  SparklesIcon,
  SparklesDetailedIcon,
  TrashIcon,
  PlusIcon,
  CheckIcon,
} from '../../src/renderer/src/components/ui/icons'

describe('Icon components', () => {
  it('should render MicrophoneIcon', () => {
    const { container } = render(<MicrophoneIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24')
  })

  it('should render SparklesIcon', () => {
    const { container } = render(<SparklesIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('class')).toContain('w-4')
  })

  it('should render SparklesDetailedIcon', () => {
    const { container } = render(<SparklesDetailedIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('class')).toContain('w-5')
  })

  it('should render TrashIcon', () => {
    const { container } = render(<TrashIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.querySelector('path')).toBeTruthy()
  })

  it('should render PlusIcon', () => {
    const { container } = render(<PlusIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('should render CheckIcon', () => {
    const { container } = render(<CheckIcon />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
  })

  it('should apply custom className', () => {
    const { container } = render(<SparklesIcon className="w-8 h-8" />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('w-8')
  })
})
