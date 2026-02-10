import type { Metadata } from 'next'
import Link from 'next/link'
import {
  getLatestRelease,
  findInstallerAsset,
  findPortableAsset,
  formatFileSize,
  formatDate,
} from '@/lib/github'

export const metadata: Metadata = {
  title: 'ダウンロード - InterviewBot',
  description:
    'InterviewBotの最新版をダウンロード。Windows 10/11対応。インストーラー版とポータブル版を選択可能。',
}

export default async function DownloadPage() {
  const release = await getLatestRelease()
  const installer = release ? findInstallerAsset(release.assets) : undefined
  const portable = release ? findPortableAsset(release.assets) : undefined
  const version = release?.tag_name?.replace('v', '') ?? '1.0.0'

  return (
    <div className="pt-16">
      {/* Hero */}
      <section className="py-20 bg-gradient-to-b from-surface to-surface-secondary">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-accent/10 to-accent/5 border border-accent/20 flex items-center justify-center shadow-card">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-content tracking-tight">
            InterviewBot をダウンロード
          </h1>
          <p className="mt-4 text-content-secondary max-w-xl mx-auto">
            Windows 10/11 (64bit) 対応。インストーラー版またはポータブル版をお選びください。
          </p>

          {release && (
            <div className="mt-4 inline-flex items-center gap-2 text-sm text-content-tertiary">
              <span>v{version}</span>
              <span className="w-1 h-1 rounded-full bg-content-tertiary" />
              <span>{formatDate(release.published_at)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Download options */}
      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Installer */}
            <DownloadCard
              title="インストーラー版"
              description="推奨。デスクトップとスタートメニューにショートカットを作成。アンインストーラー付き。"
              recommended
              asset={installer}
              fallbackUrl={`https://github.com/kuriyama920/Interview-automatic-bot/releases/latest/download/InterviewBot-Setup-${version}.exe`}
            />

            {/* Portable */}
            <DownloadCard
              title="ポータブル版"
              description="インストール不要。USBメモリ等から直接起動可能。設定はアプリと同じフォルダに保存。"
              asset={portable}
              fallbackUrl={`https://github.com/kuriyama920/Interview-automatic-bot/releases/latest/download/InterviewBot-${version}-Portable.exe`}
            />
          </div>

          {/* GitHub link */}
          <div className="mt-8 text-center">
            <a
              href="https://github.com/kuriyama920/Interview-automatic-bot/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-accent hover:text-accent-hover transition-colors"
            >
              過去のバージョンを見る (GitHub Releases) &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Install guide */}
      <section className="py-16 bg-surface-secondary">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-content text-center mb-10">
            インストール手順
          </h2>
          <div className="space-y-6">
            <Step
              number={1}
              title="ダウンロード"
              description="上のボタンからインストーラー（.exe）をダウンロードします。"
            />
            <Step
              number={2}
              title="インストーラーを実行"
              description="ダウンロードした .exe ファイルをダブルクリック。Windows SmartScreenの警告が出た場合は「詳細情報」→「実行」をクリック。"
            />
            <Step
              number={3}
              title="セットアップ完了"
              description="画面の指示に従ってインストール。完了後、デスクトップのショートカットからアプリを起動できます。"
            />
            <Step
              number={4}
              title="Googleアカウントでログイン"
              description="アプリを起動したら、Googleアカウントでログイン。無料プランですぐに利用開始できます。"
            />
          </div>
        </div>
      </section>

      {/* Back to top */}
      <section className="py-12 bg-surface text-center">
        <Link
          href="/"
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          &larr; トップページに戻る
        </Link>
      </section>
    </div>
  )
}

function DownloadCard({
  title,
  description,
  recommended,
  asset,
  fallbackUrl,
}: {
  title: string
  description: string
  recommended?: boolean
  asset?: { name: string; size: number; browser_download_url: string }
  fallbackUrl: string
}) {
  const downloadUrl = asset?.browser_download_url ?? fallbackUrl

  return (
    <div
      className={`relative p-6 rounded-2xl border transition-all ${
        recommended
          ? 'border-accent bg-surface shadow-elevated'
          : 'border-border bg-surface hover:shadow-card'
      }`}
    >
      {recommended && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent text-white shadow-soft">
            推奨
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
          recommended ? 'bg-accent/10' : 'bg-surface-tertiary'
        }`}>
          {recommended ? <InstallerIcon /> : <PortableIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-content">{title}</h3>
          <p className="text-sm text-content-secondary mt-1 leading-relaxed">{description}</p>
          {asset && (
            <p className="text-xs text-content-tertiary mt-2">
              {asset.name} ({formatFileSize(asset.size)})
            </p>
          )}
        </div>
      </div>

      <a
        href={downloadUrl}
        className={`mt-5 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-medium transition-colors ${
          recommended
            ? 'bg-accent text-white hover:bg-accent-hover'
            : 'bg-surface-tertiary text-content hover:bg-surface-hover border border-border'
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        ダウンロード
      </a>
    </div>
  )
}

function Step({
  number,
  title,
  description,
}: {
  number: number
  title: string
  description: string
}) {
  return (
    <div className="flex gap-4">
      <div className="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
        {number}
      </div>
      <div>
        <h3 className="font-semibold text-content">{title}</h3>
        <p className="text-sm text-content-secondary mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

function InstallerIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3.75H6.912a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H15M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859M12 3v8.25m0 0l-3-3m3 3l3-3" />
    </svg>
  )
}

function PortableIcon() {
  return (
    <svg className="w-6 h-6 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
    </svg>
  )
}
