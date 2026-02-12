import { AppDemo } from './demos/AppDemo'
import { AIResponseDemo, DocumentDemo, QuestionsDemo } from './demos/FeatureDemos'

export function DemoSection() {
  return (
    <section id="demo" className="pt-12 pb-24 bg-surface">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-sm font-medium text-accent">面接中のリアル画面</span>
          <h2 className="mt-3 text-3xl sm:text-4xl font-bold text-content tracking-tight">
            これが「落ちない面接」の裏側です
          </h2>
          <p className="mt-4 text-content-secondary leading-relaxed">
            面接官が話した瞬間にテキスト化、AIが即座に最適解を表示。この画面を見ながら話すだけで、面接の質が劇的に変わります
          </p>
        </div>

        {/* Main app demo */}
        <div className="mt-16 space-y-8">
          <div className="rounded-2xl border border-border bg-surface shadow-glass overflow-hidden">
            <div className="h-8 bg-surface-secondary border-b border-border flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-error/60" />
              <div className="w-3 h-3 rounded-full bg-warning/60" />
              <div className="w-3 h-3 rounded-full bg-success/60" />
              <span className="ml-3 text-xs text-content-tertiary">
                InterviewBot - メイン画面
              </span>
            </div>
            <AppDemo />
          </div>

          {/* Feature highlight cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <FeatureCard
              title="答えに詰まらないAI提案"
              description="質問された瞬間にベストな回答が表示。沈黙の恐怖から解放"
            >
              <AIResponseDemo />
            </FeatureCard>
            <FeatureCard
              title="あなた専用の回答を自動生成"
              description="履歴書を読み込むだけ。丸暗記ではない、あなただけの回答が手に入る"
            >
              <DocumentDemo />
            </FeatureCard>
            <FeatureCard
              title="想定質問20問 × AI最適解"
              description="履歴書と求人票からAIが質問を予測。あなた専用の模範回答を自動作成"
            >
              <QuestionsDemo />
            </FeatureCard>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden hover:shadow-elevated transition-shadow">
      <div className="aspect-[4/3] bg-gradient-to-br from-surface-secondary to-surface-tertiary">
        {children}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-content text-sm">{title}</h3>
        <p className="text-xs text-content-secondary mt-1">{description}</p>
      </div>
    </div>
  )
}
