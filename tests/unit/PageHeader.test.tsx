import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageHeader } from '../../src/renderer/src/components/ui/PageHeader'

describe('PageHeader', () => {
  it('should render the title', () => {
    render(<PageHeader title="テストタイトル" />)
    expect(screen.getByText('テストタイトル')).toBeDefined()
  })

  it('should render the title as h1', () => {
    render(<PageHeader title="タイトル" />)
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeDefined()
    expect(heading.textContent).toBe('タイトル')
  })

  it('should render subtitle when provided', () => {
    render(<PageHeader title="タイトル" subtitle="サブタイトルテスト" />)
    expect(screen.getByText('サブタイトルテスト')).toBeDefined()
  })

  it('should not render subtitle when not provided', () => {
    render(<PageHeader title="タイトル" />)
    // Only the title should be in the first div
    const paragraphs = screen.queryAllByText(/サブタイトル/)
    expect(paragraphs.length).toBe(0)
  })

  it('should render action when provided', () => {
    render(
      <PageHeader
        title="タイトル"
        action={<button>アクション</button>}
      />
    )
    expect(screen.getByText('アクション')).toBeDefined()
  })

  it('should not render action area when action is not provided', () => {
    const { container } = render(<PageHeader title="タイトル" />)
    // Only one direct child div (the title area), no action wrapper
    const topDiv = container.firstChild as HTMLElement
    expect(topDiv.children.length).toBe(1)
  })

  it('should render both subtitle and action together', () => {
    render(
      <PageHeader
        title="タイトル"
        subtitle="説明文"
        action={<span>ボタン</span>}
      />
    )
    expect(screen.getByText('説明文')).toBeDefined()
    expect(screen.getByText('ボタン')).toBeDefined()
  })
})
