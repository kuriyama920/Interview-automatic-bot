'use client'

import { useState } from 'react'

const faqs = [
  {
    question: '無料プランでどこまで使えますか？',
    answer:
      '無料プランでは、月30分のリアルタイム音声認識、30,000 AIトークン、3件のドキュメント登録が利用できます。面接1~2回分の利用が可能です。制限に達した場合は、次月にリセットされるか、Proプランにアップグレードできます。',
  },
  {
    question: 'オンライン面接中に使用がバレませんか？',
    answer:
      'バレません。InterviewBotは完全に独立したデスクトップアプリとして動作し、Teams・Google Meet・Zoomなどの会議アプリからは検出されません。画面共有やブラウザの通知も一切発生しません。音声キャプチャはOS標準のオーディオAPIを利用しており、会議アプリ側からは他のリスナーを検知する仕組みが存在しないため、安心してご利用いただけます。',
  },
  {
    question: 'Windows以外でも使えますか？',
    answer:
      '現在はWindows（64bit）専用です。macOS・Linux版は将来的に対応を検討しています。オンライン面接（Zoom、Teams、Google Meetなど）のシステム音声キャプチャはWindows環境で最適に動作します。',
  },
  {
    question: 'データのセキュリティは大丈夫ですか？',
    answer:
      'APIキーはローカルでAES暗号化して保存されます。音声データはリアルタイム処理のみで、サーバーに永続保存されません。ドキュメントはSupabaseの暗号化されたデータベースに安全に保管されます。全ての通信はHTTPS/WSSで暗号化されています。',
  },
  {
    question: '解約はいつでもできますか？',
    answer:
      'はい、いつでも解約可能です。アプリ内の「プラン管理」から、またはStripeのカスタマーポータルから解約できます。解約後は現在の請求期間の終了まで有料プランの機能を利用でき、その後自動的にFreeプランに移行します。',
  },
  {
    question: '自分のAPIキーを使えますか？',
    answer:
      'Proプラン以上で、OpenAIとSonioxの自分のAPIキーを設定できます。自分のAPIキーを使用する場合、使用量制限は適用されず、APIの料金は直接お使いのアカウントに請求されます。',
  },
]

export function FAQSection() {
  return (
    <section id="faq" className="py-24 bg-surface">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center">
          <span className="text-sm font-medium text-accent">FAQ</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            よくある質問
          </h2>
        </div>

        {/* FAQ items */}
        <div className="mt-12 space-y-3">
          {faqs.map((faq) => (
            <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border overflow-hidden transition-colors hover:border-accent/20">
      <button
        className="w-full flex items-center justify-between p-5 text-left"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="text-sm font-medium text-content pr-4">{question}</span>
        <svg
          className={`w-5 h-5 text-content-tertiary flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 -mt-1 animate-fade-in">
          <p className="text-sm text-content-secondary leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  )
}
