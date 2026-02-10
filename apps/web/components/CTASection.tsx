import Link from 'next/link'

export function CTASection() {
  return (
    <section className="py-24 bg-surface-secondary">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="relative p-12 rounded-3xl bg-gradient-to-br from-accent/5 via-surface to-success/5 border border-accent/10 overflow-hidden">
          {/* Background blur */}
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-success/10 rounded-full blur-3xl" />

          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-content tracking-tight">
              今すぐ無料で始めよう
            </h2>
            <p className="mt-4 text-content-secondary max-w-xl mx-auto leading-relaxed">
              無料プランでInterviewBotを体験。クレジットカード不要、30秒でセットアップ完了。
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/download"
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-accent text-white font-semibold text-base hover:bg-accent-hover transition-all shadow-elevated hover:shadow-modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Windows版をダウンロード
              </Link>
            </div>
            <p className="mt-4 text-xs text-content-tertiary">
              Windows 10/11 (64bit) 対応
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
