export function DemoSection() {
  return (
    <section id="demo" className="py-24 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-medium text-accent">デモ</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            実際の使い方を見てみよう
          </h2>
          <p className="mt-4 text-content-secondary leading-relaxed">
            面接中の画面をご覧ください。音声認識からAI回答提案まで、シームレスに動作します。
          </p>
        </div>

        {/* Screenshot gallery */}
        <div className="mt-16 space-y-8">
          {/* Main screenshot */}
          <div className="rounded-2xl border border-border bg-surface shadow-glass overflow-hidden">
            <div className="h-8 bg-surface-secondary border-b border-border flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-error/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-content-tertiary">InterviewBot - メイン画面</span>
            </div>
            <div className="aspect-video bg-gradient-to-br from-surface-secondary to-surface-tertiary flex items-center justify-center">
              <div className="text-center p-8">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
                  </svg>
                </div>
                <p className="text-content-secondary font-medium">メイン画面のスクリーンショット</p>
                <p className="text-sm text-content-tertiary mt-2">
                  実際のアプリ画面を撮影して差し替えてください
                </p>
              </div>
            </div>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ScreenshotCard
              title="リアルタイム文字起こし"
              description="面接官の質問とあなたの回答を同時に文字起こし"
            />
            <ScreenshotCard
              title="AI回答提案"
              description="質問に対する最適な回答をリアルタイムで表示"
            />
            <ScreenshotCard
              title="ドキュメント連携"
              description="アップロードした書類の情報をAIが活用"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function ScreenshotCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden hover:shadow-elevated transition-shadow">
      <div className="aspect-[4/3] bg-gradient-to-br from-surface-secondary to-surface-tertiary flex items-center justify-center">
        <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-accent/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5A1.5 1.5 0 003.75 21z" />
          </svg>
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-content text-sm">{title}</h3>
        <p className="text-xs text-content-secondary mt-1">{description}</p>
      </div>
    </div>
  )
}
