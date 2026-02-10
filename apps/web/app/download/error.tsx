'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center pt-16">
      <div className="text-center px-4">
        <h2 className="text-2xl font-bold text-content mb-4">
          ページの読み込みに失敗しました
        </h2>
        <p className="text-content-secondary mb-6">
          ネットワーク接続を確認して、もう一度お試しください。
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-accent text-white rounded-lg font-medium hover:bg-accent-hover transition-colors"
        >
          再試行
        </button>
      </div>
    </div>
  )
}
