import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '決済完了 - InterviewBot',
  description:
    'InterviewBotのプラン購入が完了しました。アプリをダウンロードして始めましょう。',
}

export default function CheckoutSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-20 pb-12">
      <div className="max-w-md w-full mx-auto px-4 text-center">
        {/* 成功アイコン */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-success/10 to-success/5 border border-success/20 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-success"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-content">決済が完了しました</h1>
        <p className="mt-3 text-content-secondary leading-relaxed">
          プランのアップグレードが正常に処理されました。
          <br />
          アプリをダウンロードして同じGoogleアカウントでログインすると、プランが自動的に反映されます。
        </p>

        {/* ダウンロード CTA */}
        <Link
          href="/download"
          className="mt-8 inline-flex items-center gap-2.5 px-8 py-4 rounded-xl bg-accent text-white font-semibold hover:bg-accent-hover transition-all shadow-elevated"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          アプリをダウンロード
        </Link>

        {/* 次のステップ */}
        <div className="mt-8 p-5 rounded-xl bg-surface-secondary text-left">
          <h3 className="font-semibold text-content text-sm mb-3">
            次のステップ
          </h3>
          <ol className="space-y-2.5 text-sm text-content-secondary">
            <li className="flex gap-2.5">
              <span className="font-bold text-accent flex-shrink-0">1.</span>
              上のボタンからアプリをダウンロード
            </li>
            <li className="flex gap-2.5">
              <span className="font-bold text-accent flex-shrink-0">2.</span>
              インストールして起動
            </li>
            <li className="flex gap-2.5">
              <span className="font-bold text-accent flex-shrink-0">3.</span>
              同じGoogleアカウントでログイン
            </li>
            <li className="flex gap-2.5">
              <span className="font-bold text-accent flex-shrink-0">4.</span>
              購入したプランが自動的に適用されます
            </li>
          </ol>
        </div>

        <Link
          href="/"
          className="mt-6 inline-block text-sm text-content-tertiary hover:text-content-secondary transition-colors"
        >
          トップページに戻る
        </Link>
      </div>
    </div>
  )
}
