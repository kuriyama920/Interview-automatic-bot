import Link from 'next/link'

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface via-surface-secondary to-accent-subtle" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-success/8 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 text-center">
        {/* Badge */}
        <div className="animate-fade-in">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-accent-subtle text-accent border border-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Windows 対応 / 無料プランあり
          </span>
        </div>

        {/* Headline */}
        <h1 className="mt-8 text-4xl sm:text-5xl lg:text-6xl font-bold text-content leading-tight tracking-tight animate-slide-up">
          AIがあなたの面接を
          <br />
          <span className="text-accent">リアルタイムで</span>サポート
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-content-secondary max-w-2xl mx-auto leading-relaxed animate-slide-up-delay">
          音声を即座に文字起こしし、GPT-5 Mini が最適な回答を提案。
          <br className="hidden sm:block" />
          履歴書や求人票の情報を活用した、あなた専用のAI面接コーチ。
        </p>

        {/* CTA buttons */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up-delay-2">
          <Link
            href="/download"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-accent text-white font-semibold text-base hover:bg-accent-hover transition-all shadow-elevated hover:shadow-modal"
          >
            <DownloadIcon />
            無料ダウンロード
          </Link>
          <a
            href="#demo"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-surface text-content font-medium text-base border border-border hover:bg-surface-hover transition-all shadow-soft"
          >
            <PlayIcon />
            デモを見る
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto animate-slide-up-delay-2">
          <StatItem value="GPT-5 Mini" label="AI モデル" />
          <StatItem value="リアルタイム" label="音声認識" />
          <StatItem value="無料" label="基本プラン" />
        </div>

        {/* App screenshot placeholder */}
        <div className="mt-16 relative max-w-4xl mx-auto animate-slide-up-delay-2">
          <div className="rounded-2xl border border-border bg-surface shadow-glass overflow-hidden">
            <div className="h-8 bg-surface-secondary border-b border-border flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-error/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-content-tertiary">InterviewBot</span>
            </div>
            <div className="aspect-video bg-gradient-to-br from-surface-secondary to-surface-tertiary flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <p className="text-sm text-content-tertiary">アプリのスクリーンショット</p>
                <p className="text-xs text-content-tertiary mt-1">後から実際の画像に差し替え</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-content">{value}</div>
      <div className="text-xs text-content-tertiary mt-0.5">{label}</div>
    </div>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
