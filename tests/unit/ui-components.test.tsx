import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  Card,
  CardHeader,
  Button,
  Badge,
  Spinner,
  Alert,
  WaveformVisualizer,
  Avatar,
  Input,
  ErrorAlert,
} from '../../src/renderer/src/components/ui/index'

vi.mock('../../src/renderer/src/utils/errorMessages', () => ({
  formatErrorMessage: (error: string) => ({
    message: `エラー: ${error}`,
    hint: error.includes('hint') ? 'ヒントテキスト' : undefined,
  }),
}))

describe('Card', () => {
  it('should render children', () => {
    render(<Card>カード内容</Card>)
    expect(screen.getByText('カード内容')).toBeTruthy()
  })

  it('should apply default variant styles', () => {
    const { container } = render(<Card>テスト</Card>)
    expect(container.querySelector('.bg-surface')).toBeTruthy()
  })

  it('should apply glass variant', () => {
    const { container } = render(<Card variant="glass">テスト</Card>)
    expect(container.querySelector('.backdrop-blur-glass')).toBeTruthy()
  })

  it('should apply elevated variant', () => {
    const { container } = render(<Card variant="elevated">テスト</Card>)
    expect(container.querySelector('.shadow-elevated')).toBeTruthy()
  })

  it('should apply padding sizes', () => {
    const { container: none } = render(<Card padding="none">テスト</Card>)
    expect(none.firstElementChild?.className).not.toContain('p-4')

    const { container: lg } = render(<Card padding="lg">テスト</Card>)
    expect(lg.querySelector('.p-6')).toBeTruthy()
  })
})

describe('CardHeader', () => {
  it('should render title', () => {
    render(<CardHeader title="ヘッダー" />)
    expect(screen.getByText('ヘッダー')).toBeTruthy()
  })

  it('should render subtitle when provided', () => {
    render(<CardHeader title="タイトル" subtitle="サブタイトル" />)
    expect(screen.getByText('サブタイトル')).toBeTruthy()
  })

  it('should render action when provided', () => {
    render(<CardHeader title="タイトル" action={<button>アクション</button>} />)
    expect(screen.getByText('アクション')).toBeTruthy()
  })
})

describe('Button', () => {
  it('should render with primary variant by default', () => {
    const { container } = render(<Button>クリック</Button>)
    expect(screen.getByText('クリック')).toBeTruthy()
    expect(container.querySelector('.bg-accent')).toBeTruthy()
  })

  it('should render danger variant', () => {
    const { container } = render(<Button variant="danger">削除</Button>)
    expect(container.querySelector('.bg-error')).toBeTruthy()
  })

  it('should show spinner when loading', () => {
    const { container } = render(<Button isLoading>読み込み中</Button>)
    // Loading replaces children with Spinner SVG
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('読み込み中')).toBeNull()
  })

  it('should be disabled when loading', () => {
    render(<Button isLoading>テスト</Button>)
    const button = document.querySelector('button')
    expect(button?.disabled).toBe(true)
  })

  it('should render left and right icons', () => {
    render(
      <Button leftIcon={<span data-testid="left">L</span>} rightIcon={<span data-testid="right">R</span>}>
        テスト
      </Button>
    )
    expect(screen.getByTestId('left')).toBeTruthy()
    expect(screen.getByTestId('right')).toBeTruthy()
  })

  it('should handle click events', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>クリック</Button>)
    fireEvent.click(screen.getByText('クリック'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('should apply size classes', () => {
    const { container } = render(<Button size="lg">大きい</Button>)
    expect(container.querySelector('.text-base')).toBeTruthy()
  })
})

describe('Badge', () => {
  it('should render with default variant', () => {
    render(<Badge>デフォルト</Badge>)
    expect(screen.getByText('デフォルト')).toBeTruthy()
  })

  it('should render success variant', () => {
    const { container } = render(<Badge variant="success">成功</Badge>)
    expect(container.querySelector('.bg-success-subtle')).toBeTruthy()
  })

  it('should render error variant', () => {
    const { container } = render(<Badge variant="error">エラー</Badge>)
    expect(container.querySelector('.bg-error-subtle')).toBeTruthy()
  })

  it('should apply md size', () => {
    const { container } = render(<Badge size="md">中</Badge>)
    expect(container.querySelector('.text-sm')).toBeTruthy()
  })
})

describe('Spinner', () => {
  it('should render SVG spinner', () => {
    const { container } = render(<Spinner />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(container.querySelector('.animate-spin')).toBeTruthy()
  })

  it('should apply size classes', () => {
    const { container: sm } = render(<Spinner size="sm" />)
    expect(sm.querySelector('.w-4')).toBeTruthy()

    const { container: lg } = render(<Spinner size="lg" />)
    expect(lg.querySelector('.w-6')).toBeTruthy()
  })
})

describe('Alert', () => {
  it('should render info variant with icon', () => {
    const { container } = render(<Alert variant="info">情報メッセージ</Alert>)
    expect(screen.getByText('情報メッセージ')).toBeTruthy()
    expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1)
  })

  it('should render success variant', () => {
    const { container } = render(<Alert variant="success">成功</Alert>)
    expect(screen.getByText('成功')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('should render warning variant', () => {
    const { container } = render(<Alert variant="warning">警告</Alert>)
    expect(screen.getByText('警告')).toBeTruthy()
  })

  it('should render error variant', () => {
    const { container } = render(<Alert variant="error">エラー</Alert>)
    expect(screen.getByText('エラー')).toBeTruthy()
  })

  it('should render close button when onClose is provided', () => {
    const onClose = vi.fn()
    const { container } = render(
      <Alert variant="info" onClose={onClose}>閉じるテスト</Alert>
    )
    // Close button has an svg with X icon
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('should not render close button when onClose is not provided', () => {
    const { container } = render(<Alert>閉じるなし</Alert>)
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})

describe('WaveformVisualizer', () => {
  it('should render bars when active', () => {
    const { container } = render(<WaveformVisualizer isActive={true} barCount={5} />)
    const bars = container.querySelectorAll('.bg-accent')
    expect(bars.length).toBe(5)
  })

  it('should render static bars when inactive', () => {
    const { container } = render(<WaveformVisualizer isActive={false} barCount={3} />)
    const bars = container.querySelectorAll('.bg-content-tertiary')
    expect(bars.length).toBe(3)
  })

  it('should use default barCount of 12', () => {
    const { container } = render(<WaveformVisualizer isActive={true} />)
    // Each bar is a div with animate-wave class
    const bars = container.querySelectorAll('.animate-wave')
    expect(bars.length).toBe(12)
  })
})

describe('Avatar', () => {
  it('should render image when src is provided', () => {
    render(<Avatar src="https://example.com/photo.jpg" name="Test" />)
    const img = screen.getByAltText('Test')
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg')
  })

  it('should render initials when no src', () => {
    render(<Avatar name="田中太郎" />)
    expect(screen.getByText('田')).toBeTruthy()
  })

  it('should render ? when no name or src', () => {
    render(<Avatar />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('should apply size classes', () => {
    const { container: sm } = render(<Avatar name="A" size="sm" />)
    expect(sm.querySelector('.w-6')).toBeTruthy()

    const { container: lg } = render(<Avatar name="A" size="lg" />)
    expect(lg.querySelector('.w-10')).toBeTruthy()
  })
})

describe('Input', () => {
  it('should render label when provided', () => {
    render(<Input label="名前" />)
    expect(screen.getByText('名前')).toBeTruthy()
  })

  it('should render error message', () => {
    render(<Input error="入力が必要です" />)
    expect(screen.getByText('入力が必要です')).toBeTruthy()
  })

  it('should render hint when no error', () => {
    render(<Input hint="ヒントテキスト" />)
    expect(screen.getByText('ヒントテキスト')).toBeTruthy()
  })

  it('should not render hint when error exists', () => {
    render(<Input error="エラー" hint="ヒント" />)
    expect(screen.getByText('エラー')).toBeTruthy()
    expect(screen.queryByText('ヒント')).toBeNull()
  })

  it('should apply error styling', () => {
    const { container } = render(<Input error="エラー" />)
    const input = container.querySelector('input')
    expect(input?.className).toContain('border-error')
  })
})

describe('ErrorAlert', () => {
  it('should render formatted error message', () => {
    render(<ErrorAlert error="test error" />)
    expect(screen.getByText('エラー: test error')).toBeTruthy()
  })

  it('should render hint when available', () => {
    render(<ErrorAlert error="hint error" />)
    expect(screen.getByText('ヒントテキスト')).toBeTruthy()
  })

  it('should render close button when onClose is provided', () => {
    const onClose = vi.fn()
    const { container } = render(<ErrorAlert error="test" onClose={onClose} />)
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBe(1)
    fireEvent.click(buttons[0])
    expect(onClose).toHaveBeenCalled()
  })

  it('should not render close button without onClose', () => {
    const { container } = render(<ErrorAlert error="test" />)
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})
