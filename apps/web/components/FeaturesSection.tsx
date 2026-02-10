const features = [
  {
    icon: MicIcon,
    title: 'リアルタイム音声認識',
    description:
      'Deepgram STT による高精度な音声認識。マイク入力とシステム音声の両方をキャプチャし、面接の会話をリアルタイムで文字起こし。',
  },
  {
    icon: SparklesIcon,
    title: 'AI 回答提案',
    description:
      'GPT-5 Mini が質問を分析し、最適な回答をリアルタイムで提案。あなたの経歴や志望動機に合わせたパーソナライズされた回答。',
  },
  {
    icon: DocumentIcon,
    title: 'コンテキスト連携',
    description:
      '履歴書・職務経歴書・求人票をアップロードすると、AIがあなたの情報を理解。pgvector RAG で的確なコンテキストを活用。',
  },
  {
    icon: SpeakerIcon,
    title: 'システム音声キャプチャ',
    description:
      'オンライン面接の相手の音声も自動キャプチャ。面接官の質問を聞き逃さず、正確に文字起こし。',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-surface-secondary">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-medium text-accent">機能紹介</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            面接の成功率を上げる4つの機能
          </h2>
          <p className="mt-4 text-content-secondary leading-relaxed">
            最先端のAI技術を活用し、面接準備から本番まであなたをサポートします
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
