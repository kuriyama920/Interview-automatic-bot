import Link from 'next/link'

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'まずは無料で体験',
    features: [
      { label: '音声認識（STT）', value: '30分 / 月' },
      { label: 'AIトークン', value: '30,000 / 月' },
      { label: 'ドキュメント', value: '3件' },
      { label: 'カスタムAPIキー', value: false },
      { label: '優先サポート', value: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 2980,
    description: '本格的な面接対策に',
    popular: true,
    features: [
      { label: '音声認識（STT）', value: '600分 / 月' },
      { label: 'AIトークン', value: '500,000 / 月' },
      { label: 'ドキュメント', value: '50件' },
      { label: 'カスタムAPIキー', value: true },
      { label: '優先サポート', value: false },
    ],
  },
  {
    id: 'max',
    name: 'Max',
    price: 14800,
    description: 'ヘビーユーザー向け',
    features: [
      { label: '音声認識（STT）', value: '3,000分 / 月' },
      { label: 'AIトークン', value: '5,000,000 / 月' },
      { label: 'ドキュメント', value: '200件' },
      { label: 'カスタムAPIキー', value: true },
      { label: '優先サポート', value: true },
    ],
  },
]

export function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-surface-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-medium text-accent">料金プラン</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            シンプルな料金体系
          </h2>
          <p className="mt-4 text-content-secondary leading-relaxed">
            無料プランから始めて、必要に応じてアップグレード。いつでも解約可能。
          </p>
        </div>

        {/* Plan cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-6 rounded-2xl border transition-all ${
                plan.popular
                  ? 'border-accent bg-surface shadow-elevated scale-[1.02]'
                  : 'border-border bg-surface hover:border-accent/30 hover:shadow-card'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-accent text-white shadow-soft">
                    おすすめ
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <h3 className="text-lg font-semibold text-content">{plan.name}</h3>
                <p className="text-sm text-content-secondary mt-1">{plan.description}</p>
                <div className="mt-4">
                  {plan.price === 0 ? (
                    <span className="text-3xl font-bold text-content">無料</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold text-content">
                        &yen;{plan.price.toLocaleString()}
                      </span>
                      <span className="text-content-secondary text-sm"> / 月</span>
                    </>
                  )}
                </div>
              </div>

              <ul className="space-y-3 text-sm mb-6">
                {plan.features.map((feature) => (
                  <li key={feature.label} className="flex items-center gap-2.5">
                    {feature.value === false ? (
                      <XIcon />
                    ) : (
                      <CheckIcon />
                    )}
                    <span className="text-content-secondary">
                      {feature.label}
                      {typeof feature.value === 'string' && (
                        <span className="font-medium text-content ml-1">{feature.value}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              <Link
                href={plan.price === 0 ? '/download' : `/checkout?plan=${plan.id}`}
                className={`block w-full py-2.5 rounded-lg text-sm font-medium text-center transition-colors ${
                  plan.popular
                    ? 'bg-accent text-white hover:bg-accent-hover'
                    : 'bg-surface-tertiary text-content hover:bg-surface-hover border border-border'
                }`}
              >
                {plan.price === 0 ? '無料で始める' : 'ダウンロードして購入'}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-content-tertiary">
          アプリ内でプランのアップグレード・ダウングレードが可能です
        </p>
      </div>
    </section>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="w-4 h-4 text-content-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
