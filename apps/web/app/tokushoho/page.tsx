import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 - InterviewBot',
  description: 'InterviewBotの特定商取引法に基づく表記です。',
}

const LAST_UPDATED = '2026年3月24日'

export default function TokushohoPage() {
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
          <h1 className="text-3xl font-bold text-content">特定商取引法に基づく表記</h1>
          <p className="mt-2 text-sm text-content-tertiary">最終更新日: {LAST_UPDATED}</p>
        </div>

        {/* Introduction */}
        <div className="mb-10 p-5 rounded-xl bg-accent-subtle border border-accent/15">
          <p className="text-sm text-content-secondary leading-relaxed">
            「特定商取引に関する法律」第11条に基づき、以下のとおり表記します。
          </p>
        </div>

        {/* Body */}
        <div className="space-y-8">
          <Row label="販売事業者" value="栗山 直人（くりやま なおと）" />
          <Row label="運営統括責任者" value="栗山 直人" />

          <Row label="所在地">
            <p>請求があった場合、遅滞なく開示いたします。</p>
            <p className="mt-1 text-xs text-content-tertiary">
              ※ 特定商取引法第11条ただし書きに基づき、個人事業主のため省略しています。
            </p>
          </Row>

          <Row label="電話番号">
            <p>請求があった場合、遅滞なく開示いたします。</p>
            <p className="mt-1 text-xs text-content-tertiary">
              ※ 特定商取引法第11条ただし書きに基づき、個人事業主のため省略しています。
            </p>
          </Row>

          <Row label="メールアドレス">
            <a
              href="mailto:interviewautomaticbot92@gmail.com"
              className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
            >
              interviewautomaticbot92@gmail.com
            </a>
          </Row>

          <Row label="販売URL">
            <a
              href="https://interview-bot-web.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
            >
              https://interview-bot-web.pages.dev
            </a>
          </Row>

          <Row label="販売価格">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-semibold text-content">プラン</th>
                    <th className="pb-2 pr-4 font-semibold text-content">月額料金（税込）</th>
                  </tr>
                </thead>
                <tbody className="text-content-secondary">
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4">Free</td>
                    <td className="py-2.5">¥0</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-2.5 pr-4">Pro</td>
                    <td className="py-2.5">¥2,980</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4">Max</td>
                    <td className="py-2.5">¥14,800</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Row>

          <Row label="商品代金以外の必要料金">
            <ul className="list-disc list-inside space-y-1.5">
              <li>インターネット接続料金</li>
              <li>通信料（お客様のご負担となります）</li>
            </ul>
          </Row>

          <Row label="お支払い方法" value="クレジットカード（Stripe決済）" />

          <Row label="お支払い時期">
            <p>サブスクリプション契約時に即時課金されます。以後、毎月同日に自動更新・課金されます。</p>
          </Row>

          <Row label="サービス提供時期">
            <p>お支払い完了後、即時ご利用いただけます。</p>
          </Row>

          <Row label="契約期間・自動更新">
            <p>契約期間は1ヶ月単位です。解約手続きが行われない限り、毎月自動的に更新されます。</p>
          </Row>

          <Row label="解約方法">
            <ol className="list-decimal list-inside space-y-1.5">
              <li>アプリ内の設定画面から「サブスクリプション管理」を選択</li>
              <li>Stripeカスタマーポータルにて解約手続き</li>
            </ol>
            <p className="mt-2">
              解約は次回更新日の前日までに行ってください。解約後も、現在の請求期間の終了まではサービスをご利用いただけます。
            </p>
          </Row>

          <Row label="返品・キャンセルについて">
            <p>
              デジタルサービスの性質上、サービス提供後の返品・返金は原則として承っておりません。
              ただし、サービスに重大な瑕疵がある場合は、個別にご対応いたしますので、メールにてお問い合わせください。
            </p>
          </Row>

          <Row label="動作環境">
            <ul className="list-disc list-inside space-y-1.5">
              <li>Windows 10以降</li>
              <li>インターネット接続環境</li>
              <li>マイク（音声認識機能利用時）</li>
            </ul>
          </Row>

          <Row label="特記事項">
            <ul className="list-disc list-inside space-y-1.5">
              <li>本サービスはAIによる面接支援ツールであり、面接の合格を保証するものではありません。</li>
              <li>AI生成の回答はあくまで参考情報です。最終的な判断はご自身で行ってください。</li>
              <li>OpenAI APIへのデータ送信時は store: false 設定により、OpenAI側にデータは保存されません。</li>
            </ul>
          </Row>
        </div>

        {/* Contact */}
        <div className="mt-10 p-5 rounded-xl bg-surface-secondary border border-border">
          <h2 className="text-sm font-semibold text-content mb-3">お問い合わせ先</h2>
          <div className="space-y-2 text-sm text-content-secondary">
            <p>
              <span className="font-medium text-content">事業者名: </span>
              栗山 直人
            </p>
            <p>
              <span className="font-medium text-content">メール: </span>
              <a
                href="mailto:interviewautomaticbot92@gmail.com"
                className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors"
              >
                interviewautomaticbot92@gmail.com
              </a>
            </p>
            <p>
              <span className="font-medium text-content">受付時間: </span>
              平日 10:00〜18:00（土日祝日を除く）
            </p>
          </div>
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

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="border-b border-border/50 pb-6">
      <h2 className="text-sm font-semibold text-content mb-2">{label}</h2>
      <div className="text-sm text-content-secondary leading-relaxed">
        {value ? <p>{value}</p> : children}
      </div>
    </div>
  )
}
