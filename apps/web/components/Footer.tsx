import Link from 'next/link'

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
              <span className="font-bold text-content">InterviewBot</span>
            </div>
            <p className="text-sm text-content-secondary leading-relaxed">
              AIがあなたの面接をリアルタイムでサポートするデスクトップアプリ
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-sm font-semibold text-content mb-3">プロダクト</h3>
            <ul className="space-y-2 text-sm text-content-secondary">
              <li><a href="/#features" className="hover:text-content transition-colors">機能紹介</a></li>
              <li><a href="/#pricing" className="hover:text-content transition-colors">料金プラン</a></li>
              <li><Link href="/download" className="hover:text-content transition-colors">ダウンロード</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-content mb-3">その他</h3>
            <ul className="space-y-2 text-sm text-content-secondary">
              <li><Link href="/privacy" className="hover:text-content transition-colors">プライバシーポリシー</Link></li>
              <li><Link href="/terms" className="hover:text-content transition-colors">利用規約</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border text-center text-xs text-content-tertiary">
          &copy; {new Date().getFullYear()} InterviewBot. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
