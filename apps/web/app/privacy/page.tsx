import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'プライバシーポリシー - InterviewBot',
  description: 'InterviewBotのプライバシーポリシーです。個人情報の取扱いについてご確認ください。',
}

const LAST_UPDATED = '2026年3月23日'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content transition-colors mb-6"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            トップに戻る
          </Link>
          <h1 className="text-3xl font-bold text-content">プライバシーポリシー</h1>
          <p className="mt-2 text-sm text-content-tertiary">最終更新日: {LAST_UPDATED}</p>
        </div>

        {/* Introduction */}
        <div className="mb-10 p-5 rounded-xl bg-accent-subtle border border-accent/15">
          <p className="text-sm text-content-secondary leading-relaxed">
            InterviewBot（以下「本サービス」）は、ユーザーの個人情報保護を重要視しています。
            個人情報の保護に関する法律（個人情報保護法）その他の関連法令を遵守し、以下のとおり個人情報を適切に取り扱います。
          </p>
        </div>

        {/* Body */}
        <div className="space-y-10">
          <Section number={1} title="収集する個人情報">
            <h3 className="font-semibold text-content text-sm mt-1 mb-2">直接提供される情報</h3>
            <ul className="list-disc list-inside space-y-1.5">
              <li>Googleアカウント情報（メールアドレス、表示名、プロフィール画像URL）</li>
              <li>お支払い情報（Stripeを通じて処理。クレジットカード情報は当方では保持しません）</li>
              <li>アップロードされたドキュメント（面接対策資料、履歴書等）</li>
              <li>お問い合わせ内容</li>
            </ul>

            <h3 className="font-semibold text-content text-sm mt-5 mb-2">自動的に収集される情報</h3>
            <ul className="list-disc list-inside space-y-1.5">
              <li>IPアドレス</li>
              <li>ブラウザの種類とバージョン</li>
              <li>アクセス日時</li>
              <li>利用状況（STT使用時間、AIトークン使用量、ドキュメント数等）</li>
              <li>Cookie情報</li>
            </ul>

            <h3 className="font-semibold text-content text-sm mt-5 mb-2">音声データについて</h3>
            <div className="p-4 rounded-xl bg-success-subtle border border-success/20">
              <p className="text-sm text-success-text leading-relaxed">
                音声認識に使用される音声データは、リアルタイムで処理され、当方のサーバーに保存されることはありません。
                音声データはSonioxのサーバーで処理され、テキスト変換後に破棄されます。
              </p>
            </div>
          </Section>

          <Section number={2} title="個人情報の利用目的">
            <p>収集した個人情報は、以下の目的で利用します。</p>
            <ol className="list-decimal list-inside space-y-2 mt-3">
              <li>本サービスの提供及び運営</li>
              <li>ユーザー認証及びアカウント管理</li>
              <li>利用料金の請求及び決済処理</li>
              <li>利用状況の分析及びサービス改善</li>
              <li>使用量制限の管理及び適用</li>
              <li>お問い合わせへの対応</li>
              <li>重要なお知らせ（規約変更、メンテナンス等）の通知</li>
              <li>不正利用の検知及び防止</li>
            </ol>
          </Section>

          <Section number={3} title="個人情報の第三者提供">
            <p>運営は、以下の場合を除き、ユーザーの個人情報を第三者に提供することはありません。</p>
            <ol className="list-decimal list-inside space-y-2 mt-3">
              <li>ユーザーの同意がある場合</li>
              <li>法令に基づき開示が必要な場合</li>
              <li>人の生命、身体または財産の保護のために必要がある場合</li>
              <li>サービス提供に必要な業務委託先への提供（下記参照）</li>
            </ol>
          </Section>

          <Section number={4} title="外部サービスとの連携">
            <p>本サービスは、以下の外部サービスと連携しており、各サービスのプライバシーポリシーに基づいてデータが処理されます。</p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-semibold text-content">サービス</th>
                    <th className="pb-2 pr-4 font-semibold text-content">目的</th>
                    <th className="pb-2 font-semibold text-content">取扱データ</th>
                  </tr>
                </thead>
                <tbody className="text-content-secondary">
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4"><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">Google</a></td>
                    <td className="py-2.5 pr-4">認証</td>
                    <td className="py-2.5">メール、表示名</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4"><a href="https://stripe.com/jp/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">Stripe</a></td>
                    <td className="py-2.5 pr-4">決済</td>
                    <td className="py-2.5">決済情報（カード情報はStripeが管理）</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4"><a href="https://soniox.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">Soniox</a></td>
                    <td className="py-2.5 pr-4">音声認識</td>
                    <td className="py-2.5">音声ストリーム（処理後破棄）</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4"><a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">OpenAI</a></td>
                    <td className="py-2.5 pr-4">AI生成</td>
                    <td className="py-2.5">面接文脈テキスト（store: false設定によりOpenAI側に保存されません）</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4"><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">Supabase</a></td>
                    <td className="py-2.5 pr-4">DB・認証基盤</td>
                    <td className="py-2.5">ユーザー・使用量データ</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4"><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover transition-colors">Cloudflare</a></td>
                    <td className="py-2.5 pr-4">ホスティング</td>
                    <td className="py-2.5">アクセスログ、IP</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section number={5} title="Cookieの使用">
            <p>本サービスでは、以下の目的でCookieを使用します。</p>
            <ol className="list-decimal list-inside space-y-2 mt-3">
              <li>ユーザーの認証状態の維持</li>
              <li>サービス利用状況の分析</li>
              <li>ユーザー体験の向上</li>
            </ol>
            <p className="mt-3">
              ブラウザの設定によりCookieを無効にすることができますが、一部機能が正常に動作しなくなる場合があります。
            </p>
          </Section>

          <Section number={6} title="データの保管とセキュリティ">
            <p>運営は、ユーザーの個人情報を保護するために、以下のセキュリティ対策を実施しています。</p>
            <ul className="list-disc list-inside space-y-2 mt-3">
              <li>SSL/TLS暗号化通信の使用</li>
              <li>データベースへのアクセス制御</li>
              <li>APIキーのAES暗号化保存（デスクトップアプリ）</li>
              <li>JWT認証トークンによるアクセス管理</li>
              <li>Row Level Security（RLS）によるデータ分離</li>
              <li>定期的なセキュリティ監査の実施</li>
              <li>OpenAI API呼び出し時のstore: false固定設定（AI側にデータを保存しない）</li>
              <li>AIとの対話履歴はセッション終了後にサーバー側に残りません</li>
            </ul>
          </Section>

          <Section number={7} title="データの保持期間">
            <ol className="list-decimal list-inside space-y-2">
              <li>アカウントデータ: アカウント削除まで保持</li>
              <li>アップロードドキュメント: ユーザーが削除するか、アカウント削除時に削除</li>
              <li>利用ログ: 最大90日間保持後に自動削除</li>
              <li>決済情報: Stripeのポリシーに準じて保持</li>
              <li>音声データ: リアルタイム処理のみ、保存なし</li>
              <li>AIテキストデータ: OpenAI APIにstore: false固定設定のため、OpenAI側でデータは保持されません</li>
            </ol>
          </Section>

          <Section number={8} title="プライバシーポリシーの変更">
            <ol className="list-decimal list-inside space-y-2">
              <li>運営は、必要に応じて本プライバシーポリシーを変更することがあります。</li>
              <li>重要な変更を行う場合、適切な方法でユーザーに通知するよう努めます。</li>
              <li>変更後のプライバシーポリシーは、本ページに掲載した時点から効力を生じるものとします。</li>
            </ol>
          </Section>

          <Section number={9} title="お問い合わせ">
            <p>
              個人情報の取扱いに関するお問い合わせは、以下の連絡先までご連絡ください。
            </p>
            <div className="mt-3 p-4 rounded-xl bg-surface-secondary border border-border">
              <div className="space-y-2 text-sm text-content-secondary">
                <p>
                  <span className="font-medium text-content">サービス名: </span>
                  InterviewBot
                </p>
                <p>
                  <span className="font-medium text-content">メール: </span>
                  <a href="mailto:interviewautomaticbot92@gmail.com" className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors">
                    interviewautomaticbot92@gmail.com
                  </a>
                </p>
                <p>
                  <span className="font-medium text-content">受付時間: </span>
                  平日 10:00〜18:00（土日祝日を除く）
                </p>
              </div>
            </div>
          </Section>
        </div>

        <div className="mt-10 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-content-secondary hover:text-content transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            トップページに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}

function Section({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-content mb-3">
        <span className="text-accent mr-1.5">第{number}条</span>
        {title}
      </h2>
      <div className="text-sm text-content-secondary leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  )
}

