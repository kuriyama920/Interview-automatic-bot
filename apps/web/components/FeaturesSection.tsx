const features = [
  {
    icon: MicIcon,
    title: '面接官の質問、聞き逃していませんか？',
    description:
      '緊張で頭が真っ白になり、質問を聞き返す。それだけで印象は大幅ダウン。このアプリは全ての会話をリアルタイムで文字起こしするので、聞き逃しがゼロになります。',
  },
  {
    icon: SparklesIcon,
    title: '「あの時こう言えば…」その後悔、もう終わりに',
    description:
      '面接後に完璧な回答を思いつく。誰もが経験するその悔しさ、もう味わう必要はありません。AIが質問の瞬間にベストな回答を提案。準備不足でも、その場で最適解が手に入ります。',
  },
  {
    icon: DocumentIcon,
    title: '丸暗記の回答、面接官には見抜かれています',
    description:
      '応募先に合わない汎用的な回答では内定は出ません。履歴書と求人票を読み込ませるだけで、AIがあなたの経歴と応募先に完璧にマッチした回答を作成します。',
  },
  {
    icon: SpeakerIcon,
    title: 'オンライン面接、音声トラブルで落ちてませんか？',
    description:
      '通信環境が悪くて質問が途切れた。でも聞き返せない。そんな致命的な事故を防ぎます。相手の音声を自動で取得し、聞き取れなかった部分もテキストで即表示。',
  },
  {
    icon: ShieldIcon,
    title: 'バレたら終わり？大丈夫、100%検出不可です',
    description:
      'Teams・Google Meet・Zoomのどれを使っても、このアプリの存在は一切検出されません。通知も画面共有も発生しない完全なステルス設計。使っていることは誰にもわかりません。',
  },
  {
    icon: LockIcon,
    title: '面接の内容が漏れたら、人生が終わる',
    description:
      'だからこそ、音声データはサーバーに一切保存しません。すべての通信は暗号化済み。あなたの面接内容が外部に漏れることは技術的にありえない設計です。',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-surface-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-medium text-accent">使わないと損する理由</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            その面接、素手で挑むつもりですか？
          </h2>
          <p className="mt-4 text-content-secondary leading-relaxed">
            他の候補者はもうAIを使っています。準備不足のまま面接に臨んで、また「お祈りメール」を受け取りますか？
          </p>
        </div>

        {/* Cards */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl bg-surface border border-border hover:border-accent/30 transition-all hover:shadow-elevated"
            >
              <div className="w-12 h-12 rounded-xl bg-accent-subtle flex items-center justify-center group-hover:bg-accent-muted transition-colors">
                <feature.icon />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-content">{feature.title}</h3>
              <p className="mt-2 text-sm text-content-secondary leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MicIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
    </svg>
  )
}

function DocumentIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

function SpeakerIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  )
}
