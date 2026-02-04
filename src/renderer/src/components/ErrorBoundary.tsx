import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

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
        <div className="min-h-screen bg-base-200 p-4 flex items-center justify-center" data-theme="dark">
          <div className="card bg-base-100 shadow-xl max-w-md">
            <div className="card-body text-center">
              <h2 className="card-title text-error justify-center">エラーが発生しました</h2>
              <p className="text-base-content/70">
                アプリケーションで予期しないエラーが発生しました。
              </p>
              {this.state.error && (
                <div className="mt-4 p-3 bg-base-200 rounded-lg text-left">
                  <p className="text-sm font-mono text-error">
                    {this.state.error.message}
                  </p>
                </div>
              )}
              <div className="card-actions justify-center mt-4">
                <button className="btn btn-primary" onClick={this.handleReload}>
                  アプリを再読み込み
                </button>
                <button className="btn btn-ghost" onClick={this.handleReset}>
                  再試行
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
