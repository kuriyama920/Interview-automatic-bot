import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '利用規約 - InterviewBot',
  description: 'InterviewBotの利用規約です。サービスをご利用いただく前に必ずお読みください。',
}

const LAST_UPDATED = '2026年2月11日'

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold text-content">利用規約</h1>
          <p className="mt-2 text-sm text-content-tertiary">最終更新日: {LAST_UPDATED}</p>
        </div>

        {/* Body */}
        <div className="space-y-10">
          <Section number={1} title="サービスの概要">
            <p>
              InterviewBot（以下「本サービス」）は、AI技術を活用してリアルタイム音声認識と面接回答支援を提供するデスクトップアプリケーション及び関連するウェブサービスです。
              本規約は、本サービスの利用条件を定めるものであり、ユーザーが本サービスを利用する際に適用されます。
            </p>
          </Section>

          <Section number={2} title="利用登録">
            <ol className="list-decimal list-inside space-y-2">
              <li>本サービスの一部機能を利用するためには、Googleアカウントを用いたアカウント登録が必要です。</li>
              <li>登録情報は正確かつ最新のものである必要があります。</li>
              <li>ユーザーは、自身のアカウントの管理について一切の責任を負うものとします。</li>
              <li>アカウントの不正使用による損害について、運営は一切の責任を負いません。</li>
            </ol>
          </Section>

          <Section number={3} title="料金及び支払い">
            <ol className="list-decimal list-inside space-y-2">
              <li>本サービスには無料プラン及び有料プラン（Pro、Max）があります。</li>
              <li>有料プランの料金は、サービス内の料金ページに記載された金額とします。</li>
              <li>支払いはStripeを通じたクレジットカード決済で処理されます。</li>
              <li>有料プランは月額自動更新制であり、解約手続きを行うまで毎月自動的に課金されます。</li>
              <li>プランの解約はいつでもカスタマーポータルから行うことができます。解約後も当月末まではプランの機能をご利用いただけます。</li>
              <li>一度お支払いいただいた料金の返金は原則として行いません。ただし、法令に基づく場合はこの限りではありません。</li>
            </ol>
          </Section>

          <Section number={4} title="利用制限">
            <p>各プランに設定された使用量の上限（STT時間、AIトークン数、ドキュメント数）を超過した場合、該当機能の利用が制限されます。使用量は毎月1日にリセットされます。</p>
          </Section>

          <Section number={5} title="禁止事項">
            <p>ユーザーは、以下の行為を行ってはならないものとします。</p>
            <ol className="list-decimal list-inside space-y-2 mt-3">
              <li>法令または公序良俗に違反する行為</li>
              <li>犯罪行為に関連する行為</li>
              <li>本サービスのサーバーまたはネットワークの機能を破壊または妨害する行為</li>
              <li>本サービスの運営を妨害するおそれのある行為</li>
              <li>他のユーザーに関する個人情報等を収集または蓄積する行為</li>
              <li>他のユーザーに成りすます行為</li>
              <li>本サービスに関連して、反社会的勢力に対して直接または間接に利益を供与する行為</li>
              <li>本サービスを不正な目的（試験のカンニング等）で使用する行為</li>
            </ol>
          </Section>

          <Section number={6} title="知的財産権">
            <ol className="list-decimal list-inside space-y-2">
              <li>本サービスに関するすべての知的財産権は運営に帰属します。</li>
              <li>ユーザーがアップロードしたドキュメント及びデータの所有権はユーザーに帰属します。</li>
              <li>運営はユーザーデータをサービス提供の目的でのみ利用し、第三者に提供することはありません。</li>
            </ol>
          </Section>

          <Section number={7} title="サービスの変更・中断・終了">
            <ol className="list-decimal list-inside space-y-2">
              <li>運営は、事前の通知なくサービス内容の変更、一時中断、または終了を行うことがあります。</li>
              <li>サーバーの保守、天災地変、その他不可抗力により本サービスを提供できない場合、運営は一切の責任を負いません。</li>
              <li>サービスの終了時は、可能な限り30日前までにユーザーへ通知するよう努めます。</li>
            </ol>
          </Section>

          <Section number={8} title="免責事項">
            <ol className="list-decimal list-inside space-y-2">
              <li>本サービスは「現状のまま」で提供され、特定の目的への適合性、正確性、完全性を保証するものではありません。</li>
              <li>AIが生成する回答はあくまで参考情報であり、その内容の正確性・適切性を保証するものではありません。</li>
              <li>本サービスの利用により生じた損害について、運営は直接損害に限り、かつ当該ユーザーが過去1か月間に支払った利用料金の額を上限として責任を負います。</li>
              <li>本サービスを面接で使用したことにより生じた結果（合否等）について、運営は一切の責任を負いません。</li>
            </ol>
          </Section>

          <Section number={9} title="個人情報の取扱い">
            <p>
              ユーザーの個人情報の取扱いについては、別途定める
              <Link href="/privacy" className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors">
                プライバシーポリシー
              </Link>
              に従います。
            </p>
          </Section>

          <Section number={10} title="規約の変更">
            <ol className="list-decimal list-inside space-y-2">
              <li>運営は、必要と判断した場合、本規約を随時変更することができます。</li>
              <li>規約変更後にユーザーが本サービスを利用した場合、変更後の規約に同意したものとみなします。</li>
              <li>重要な変更を行う場合、適切な方法でユーザーに通知するよう努めます。</li>
            </ol>
          </Section>

          <Section number={11} title="準拠法・裁判管轄">
            <ol className="list-decimal list-inside space-y-2">
              <li>本規約の解釈にあたっては、日本法を準拠法とします。</li>
              <li>本サービスに関して紛争が生じた場合には、東京地方裁判所を第一審の専属的合意管轄裁判所とします。</li>
            </ol>
          </Section>

          <Section number={12} title="お問い合わせ">
            <p>
              本規約に関するお問い合わせは、以下のメールアドレスまでご連絡ください。
            </p>
            <div className="mt-3 p-4 rounded-xl bg-surface-secondary border border-border">
              <p className="text-sm text-content-secondary">
                <span className="font-medium text-content">メール: </span>
                <a href="mailto:interviewautomaticbot92@gmail.com" className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors">
                  interviewautomaticbot92@gmail.com
                </a>
              </p>
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
