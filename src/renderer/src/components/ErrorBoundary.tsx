/**
 * エラーバウンダリコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { Component, type ReactNode } from 'react'
import { Button, Card } from './ui'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

// エラーアイコン
const ErrorIcon = () => (
  <svg className="w-16 h-16 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
)

// リフレッシュアイコン
const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
)

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface-secondary flex items-center justify-center p-6">
          {/* 装飾ブラー */}
          <div className="fixed top-20 left-20 w-64 h-64 bg-error/10 rounded-full blur-3xl pointer-events-none" />
          <div className="fixed bottom-20 right-20 w-80 h-80 bg-warning/10 rounded-full blur-3xl pointer-events-none" />

          <Card variant="glass" padding="lg" className="max-w-md w-full text-center animate-fade-in">
            <div className="flex flex-col items-center gap-4">
              {/* アイコン */}
              <div className="p-4 bg-error-subtle rounded-full">
                <ErrorIcon />
              </div>

              {/* タイトル */}
              <h2 className="text-xl font-semibold text-content">
                エラーが発生しました
              </h2>

              {/* 説明 */}
              <p className="text-sm text-content-secondary">
                アプリケーションで予期しないエラーが発生しました。
                <br />
                再読み込みをお試しください。
              </p>

              {/* エラーメッセージ */}
              {this.state.error && (
                <div className="w-full p-3 bg-surface-tertiary rounded-lg text-left border border-border">
                  <p className="text-xs font-mono text-error break-all">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              {/* アクションボタン */}
              <div className="flex gap-3 mt-2">
                <Button
                  variant="primary"
                  leftIcon={<RefreshIcon />}
                  onClick={this.handleReload}
                >
                  アプリを再読み込み
                </Button>
                <Button variant="ghost" onClick={this.handleReset}>
                  再試行
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
