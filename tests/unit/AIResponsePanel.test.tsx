import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUseInterview = vi.fn()

vi.mock('../../src/renderer/src/contexts/InterviewContext', () => ({
  useInterview: () => mockUseInterview(),
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Spinner: ({ size, className }: { size?: string; className?: string }) => (
    <span data-testid="spinner" data-size={size} className={className}>Spinner</span>
  ),
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  SparklesDetailedIcon: () => <span data-testid="sparkles-icon">SparklesIcon</span>,
}))

import { AIResponsePanel } from '../../src/renderer/src/components/interview/AIResponsePanel'

describe('AIResponsePanel', () => {
  const defaultContext = {
    aiResponse: null as AIResponse | null,
    streamingText: '',
    isGenerating: false,
    cachedMatch: null as { answer: string; similarity: number } | null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseInterview.mockReturnValue(defaultContext)
  })

  it('should render the header with AI title', () => {
    render(<AIResponsePanel />)
    expect(screen.getByText('AI 回答提案')).toBeDefined()
  })

  it('should render the AI title text', () => {
    render(<AIResponsePanel />)
    const titles = screen.getAllByText('AI 回答提案')
    expect(titles.length).toBeGreaterThanOrEqual(1)
  })

  it('should show empty state when no response and not generating', () => {
    render(<AIResponsePanel />)
    expect(screen.getByText('面接官の質問に対するAI推奨回答がここに表示されます')).toBeDefined()
  })

  it('should show skeleton when generating with no streaming text', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: '',
    })
    render(<AIResponsePanel />)
    // Skeleton has animate-pulse divs, no displayText so skeleton renders
    expect(screen.queryByText('面接官の質問に対するAI推奨回答がここに表示されます')).toBeNull()
  })

  it('should show generating status indicator when generating', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: '',
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('生成中...')).toBeDefined()
    expect(screen.getByTestId('spinner')).toBeDefined()
  })

  it('should show streaming text while generating', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: 'ストリーミングテキスト',
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('ストリーミングテキスト')).toBeDefined()
  })

  it('should show AI assistant label when streaming text is displayed', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: 'テスト回答',
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('AI アシスタント')).toBeDefined()
  })

  it('should show completed response with success status', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      aiResponse: { answer: '完了した回答テキスト', suggestions: [], confidence: 0.9 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('完了した回答テキスト')).toBeDefined()
    expect(screen.getByText('完了')).toBeDefined()
  })

  it('should prioritize streamingText when generating', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: 'ストリーミング中',
      aiResponse: { answer: '以前の回答', suggestions: [], confidence: 0.9 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('ストリーミング中')).toBeDefined()
  })

  it('should prioritize aiResponse.answer when not generating', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: false,
      streamingText: '残りのストリーミング',
      aiResponse: { answer: '完了回答', suggestions: [], confidence: 0.9 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('完了回答')).toBeDefined()
  })

  it('should show cached match with similarity percentage', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      cachedMatch: { answer: 'キャッシュされた回答', similarity: 0.85 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('キャッシュされた回答')).toBeDefined()
    expect(screen.getByText('想定質問マッチ')).toBeDefined()
    expect(screen.getByText('類似度 85%')).toBeDefined()
  })

  it('should show instant match badge when cached match exists', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      cachedMatch: { answer: 'テスト回答', similarity: 0.9 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('即時マッチ')).toBeDefined()
  })

  it('should not show status indicators when idle with no response', () => {
    render(<AIResponsePanel />)
    expect(screen.queryByText('生成中...')).toBeNull()
    expect(screen.queryByText('完了')).toBeNull()
    expect(screen.queryByText('即時マッチ')).toBeNull()
  })

  it('should show skeleton when generating with no streamingText even if aiResponse exists', () => {
    // When isGenerating=true && streamingText='', skeleton is shown (regardless of aiResponse)
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: true,
      streamingText: '',
      aiResponse: { answer: 'フォールバック回答', suggestions: [], confidence: 0.5 },
    })
    render(<AIResponsePanel />)
    // skeleton renders, not the text
    expect(screen.queryByText('フォールバック回答')).toBeNull()
    expect(screen.queryByText('面接官の質問に対するAI推奨回答がここに表示されます')).toBeNull()
  })

  it('should round similarity percentage correctly', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      cachedMatch: { answer: '回答', similarity: 0.876 },
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('類似度 88%')).toBeDefined()
  })

  it('should show streamingText as fallback when not generating and no aiResponse', () => {
    mockUseInterview.mockReturnValue({
      ...defaultContext,
      isGenerating: false,
      streamingText: '残りテキスト',
      aiResponse: null,
    })
    render(<AIResponsePanel />)
    expect(screen.getByText('残りテキスト')).toBeDefined()
  })
})
