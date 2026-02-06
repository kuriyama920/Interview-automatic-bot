/**
 * テスト用の履歴書・求人票DOCXファイルを生成するスクリプト
 *
 * 使い方:
 *   node scripts/generate-test-docs.mjs
 *
 * 出力:
 *   test-data/resume_tanaka_taro.docx   - テスト用履歴書
 *   test-data/job_posting_ai_engineer.docx - テスト用求人票
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx'
import { writeFileSync, mkdirSync, existsSync } from 'fs'

const OUTPUT_DIR = 'test-data'

// ============================================
// 1. テスト用履歴書
// ============================================
function createResume() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // タイトル
          new Paragraph({
            text: '履歴書',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // 基本情報
          new Paragraph({ text: '基本情報', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '氏名: 田中 太郎（たなか たろう）' })] }),
          new Paragraph({ children: [new TextRun({ text: '生年月日: 1995年4月15日（29歳）' })] }),
          new Paragraph({ children: [new TextRun({ text: '住所: 東京都渋谷区神宮前1-2-3' })] }),
          new Paragraph({ children: [new TextRun({ text: '電話: 090-1234-5678' })] }),
          new Paragraph({ children: [new TextRun({ text: 'メール: tanaka.taro@example.com' })] }),
          new Paragraph({ text: '' }),

          // 学歴
          new Paragraph({ text: '学歴', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '2014年4月 東京大学 工学部 情報工学科 入学' })] }),
          new Paragraph({ children: [new TextRun({ text: '2018年3月 東京大学 工学部 情報工学科 卒業' })] }),
          new Paragraph({ children: [new TextRun({ text: '2018年4月 東京大学大学院 情報理工学系研究科 入学' })] }),
          new Paragraph({ children: [new TextRun({ text: '2020年3月 東京大学大学院 情報理工学系研究科 修了' })] }),
          new Paragraph({ text: '' }),

          // 職歴
          new Paragraph({ text: '職歴', heading: HeadingLevel.HEADING_1 }),

          new Paragraph({ text: '株式会社テックコーポレーション（2020年4月〜2023年3月）', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun({ text: '職種: ソフトウェアエンジニア' })] }),
          new Paragraph({ children: [new TextRun({ text: '担当業務:' })] }),
          new Paragraph({ children: [new TextRun({ text: '- Webアプリケーション開発（React, TypeScript, Node.js）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- マイクロサービスアーキテクチャの設計・実装' })] }),
          new Paragraph({ children: [new TextRun({ text: '- CI/CDパイプラインの構築（GitHub Actions, Docker）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- チーム5名のテックリードとして技術選定を主導' })] }),
          new Paragraph({ children: [new TextRun({ text: '実績:' })] }),
          new Paragraph({ children: [new TextRun({ text: '- レガシーシステムのモダナイゼーションプロジェクトをリード' })] }),
          new Paragraph({ children: [new TextRun({ text: '- APIレスポンスタイムを平均40%改善' })] }),
          new Paragraph({ children: [new TextRun({ text: '- ユニットテストカバレッジを30%から85%に向上' })] }),
          new Paragraph({ text: '' }),

          new Paragraph({ text: '株式会社AIソリューションズ（2023年4月〜現在）', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({ children: [new TextRun({ text: '職種: シニアAIエンジニア' })] }),
          new Paragraph({ children: [new TextRun({ text: '担当業務:' })] }),
          new Paragraph({ children: [new TextRun({ text: '- LLMを活用したプロダクト開発（GPT-4, Claude）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- RAGシステムの設計・実装（pgvector, Pinecone）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- プロンプトエンジニアリングとモデル最適化' })] }),
          new Paragraph({ children: [new TextRun({ text: '- Pythonによるデータパイプライン構築' })] }),
          new Paragraph({ children: [new TextRun({ text: '実績:' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 社内チャットボットの開発で問い合わせ対応時間を60%削減' })] }),
          new Paragraph({ children: [new TextRun({ text: '- RAGベースのドキュメント検索システムで検索精度を92%達成' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 月間1000万トークンのコスト最適化で30%のコスト削減' })] }),
          new Paragraph({ text: '' }),

          // 技術スキル
          new Paragraph({ text: '技術スキル', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: 'プログラミング言語: TypeScript, Python, Go, Java' })] }),
          new Paragraph({ children: [new TextRun({ text: 'フロントエンド: React, Next.js, Vue.js, Tailwind CSS' })] }),
          new Paragraph({ children: [new TextRun({ text: 'バックエンド: Node.js, Express, FastAPI, Spring Boot' })] }),
          new Paragraph({ children: [new TextRun({ text: 'AI/ML: OpenAI API, LangChain, Hugging Face, PyTorch' })] }),
          new Paragraph({ children: [new TextRun({ text: 'データベース: PostgreSQL, MongoDB, Redis, pgvector' })] }),
          new Paragraph({ children: [new TextRun({ text: 'クラウド: AWS (EC2, Lambda, S3, RDS), GCP (Cloud Run)' })] }),
          new Paragraph({ children: [new TextRun({ text: 'DevOps: Docker, Kubernetes, Terraform, GitHub Actions' })] }),
          new Paragraph({ text: '' }),

          // 資格
          new Paragraph({ text: '資格・認定', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '- AWS Solutions Architect Associate（2021年取得）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- Google Cloud Professional Data Engineer（2022年取得）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 応用情報技術者試験 合格（2019年）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- TOEIC 870点（2023年）' })] }),
          new Paragraph({ text: '' }),

          // 自己PR
          new Paragraph({ text: '自己PR', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text: '大学院での自然言語処理の研究経験を活かし、AIとソフトウェアエンジニアリングの両方に精通しています。前職ではWebアプリケーション開発の基礎を固め、現職ではLLMを活用したプロダクト開発に注力しています。特にRAGシステムの設計・実装に強みがあり、大規模なドキュメントベースから高精度な情報検索を実現してきました。',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({
            children: [
              new TextRun({
                text: 'チームワークを重視し、技術的な課題をビジネス価値に結びつけることを常に意識しています。新しい技術への好奇心と、既存システムの改善への情熱を持ち、プロダクトの品質向上に貢献できると考えています。',
              }),
            ],
          }),
          new Paragraph({ text: '' }),

          // 希望条件
          new Paragraph({ text: '希望条件', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '希望年収: 800万円〜1000万円' })] }),
          new Paragraph({ children: [new TextRun({ text: '勤務形態: リモートワーク可能な環境を希望' })] }),
          new Paragraph({ children: [new TextRun({ text: '勤務地: 東京都内（リモート併用可）' })] }),
          new Paragraph({ children: [new TextRun({ text: '入社可能日: 2025年4月以降' })] }),
        ],
      },
    ],
  })

  return doc
}

// ============================================
// 2. テスト用求人票
// ============================================
function createJobPosting() {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // タイトル
          new Paragraph({
            text: '求人票',
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // 企業情報
          new Paragraph({ text: '企業情報', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '企業名: 株式会社フューチャーAIテクノロジーズ' })] }),
          new Paragraph({ children: [new TextRun({ text: '所在地: 東京都港区六本木6-10-1 六本木ヒルズ森タワー35F' })] }),
          new Paragraph({ children: [new TextRun({ text: '設立: 2019年4月' })] }),
          new Paragraph({ children: [new TextRun({ text: '従業員数: 150名（2024年12月現在）' })] }),
          new Paragraph({ children: [new TextRun({ text: '資本金: 5億円' })] }),
          new Paragraph({ children: [new TextRun({ text: '事業内容: AIソリューション開発、SaaS製品提供、コンサルティング' })] }),
          new Paragraph({ text: '' }),

          // 募集職種
          new Paragraph({ text: '募集職種', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [new TextRun({ text: 'シニアAIエンジニア / テックリード', bold: true, size: 28 })],
          }),
          new Paragraph({ text: '' }),

          // 仕事内容
          new Paragraph({ text: '仕事内容', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({
                text: '当社のAIプラットフォーム「AIアシスタント」の開発チームにおいて、LLMを活用した次世代プロダクトの設計・開発をリードしていただきます。',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: '具体的な業務内容:', bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: '1. LLMベースのAIアシスタント機能の設計・実装' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - GPT-4o, Claude 3.5等の最新モデルを活用' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - プロンプトエンジニアリングとモデル選定' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - ストリーミングレスポンスの最適化' })] }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: '2. RAGシステムの構築・改善' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - pgvectorを活用したベクトル検索基盤' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - ドキュメント処理パイプラインの設計' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - Embeddingモデルの評価と最適化' })] }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: '3. アーキテクチャ設計とチームリード' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - マイクロサービスアーキテクチャの設計' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - 技術選定とPoCの実施' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - 5〜8名のエンジニアチームのテックリード' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - コードレビューとメンタリング' })] }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: '4. プロダクト品質の向上' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - テスト戦略の策定（ユニット、統合、E2E）' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - CI/CDパイプラインの構築' })] }),
          new Paragraph({ children: [new TextRun({ text: '   - パフォーマンス最適化とモニタリング' })] }),
          new Paragraph({ text: '' }),

          // 応募資格
          new Paragraph({ text: '応募資格', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '必須要件:', bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: '- ソフトウェア開発経験3年以上' })] }),
          new Paragraph({ children: [new TextRun({ text: '- TypeScript, Pythonでの開発経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- LLM（GPT-4, Claude等）を活用した開発経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- Webアプリケーション（React, Next.js等）の開発経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- RDBMSを使ったシステムの設計・開発経験' })] }),
          new Paragraph({ text: '' }),
          new Paragraph({ children: [new TextRun({ text: '歓迎要件:', bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: '- RAGシステムの設計・実装経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- ベクトルデータベース（pgvector, Pinecone等）の使用経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- AWSまたはGCPでのインフラ構築経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- チームリードまたはテックリードの経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 自然言語処理や機械学習の研究経験' })] }),
          new Paragraph({ children: [new TextRun({ text: '- OSSへのコントリビュション' })] }),
          new Paragraph({ text: '' }),

          // 求める人物像
          new Paragraph({ text: '求める人物像', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '- 新しい技術に対して積極的に学習し、チームに共有できる方' })] }),
          new Paragraph({ children: [new TextRun({ text: '- ビジネス課題をテクノロジーで解決することに情熱を持つ方' })] }),
          new Paragraph({ children: [new TextRun({ text: '- チームメンバーの成長に貢献できる方' })] }),
          new Paragraph({ children: [new TextRun({ text: '- ユーザー視点でプロダクトを改善できる方' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 品質にこだわりを持ち、テストやドキュメントを重視する方' })] }),
          new Paragraph({ text: '' }),

          // 給与・待遇
          new Paragraph({ text: '給与・待遇', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '年収: 800万円〜1,200万円（経験・能力により決定）' })] }),
          new Paragraph({ children: [new TextRun({ text: '給与改定: 年2回（4月、10月）' })] }),
          new Paragraph({ children: [new TextRun({ text: '賞与: 業績連動（年2回）' })] }),
          new Paragraph({ children: [new TextRun({ text: 'ストックオプション: あり（グレードに応じて付与）' })] }),
          new Paragraph({ text: '' }),

          // 福利厚生
          new Paragraph({ text: '福利厚生', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '- 各種社会保険完備' })] }),
          new Paragraph({ children: [new TextRun({ text: '- リモートワーク手当（月5万円）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 書籍購入補助（月1万円）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- カンファレンス参加費全額補助' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 最新開発機器の貸与（MacBook Pro, 4Kモニター等）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- フレックスタイム制（コアタイム11:00-15:00）' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 年間休日125日' })] }),
          new Paragraph({ text: '' }),

          // 勤務条件
          new Paragraph({ text: '勤務条件', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '勤務地: 東京本社（リモートワーク週3日まで可）' })] }),
          new Paragraph({ children: [new TextRun({ text: '勤務時間: フレックスタイム制 標準8時間' })] }),
          new Paragraph({ children: [new TextRun({ text: '雇用形態: 正社員（試用期間3ヶ月）' })] }),
          new Paragraph({ text: '' }),

          // 選考プロセス
          new Paragraph({ text: '選考プロセス', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '1. 書類選考（履歴書・職務経歴書）' })] }),
          new Paragraph({ children: [new TextRun({ text: '2. 技術面接（1時間）- コーディング課題あり' })] }),
          new Paragraph({ children: [new TextRun({ text: '3. チーム面接（1時間）- カルチャーフィット確認' })] }),
          new Paragraph({ children: [new TextRun({ text: '4. 最終面接（30分）- CTO面接' })] }),
          new Paragraph({ children: [new TextRun({ text: '5. オファー面談' })] }),
          new Paragraph({ text: '' }),

          // 面接で聞かれる質問例
          new Paragraph({ text: '面接で聞かれる質問例', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ children: [new TextRun({ text: '- これまでで最も技術的にチャレンジングだったプロジェクトについて教えてください' })] }),
          new Paragraph({ children: [new TextRun({ text: '- LLMを活用したプロダクト開発でどのような課題に直面しましたか？' })] }),
          new Paragraph({ children: [new TextRun({ text: '- RAGシステムの検索精度を向上させるためにどのようなアプローチを取りましたか？' })] }),
          new Paragraph({ children: [new TextRun({ text: '- チームの技術力を向上させるために何をしましたか？' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 5年後のキャリアビジョンを教えてください' })] }),
          new Paragraph({ children: [new TextRun({ text: '- 技術選定で意見が分かれた場合、どのように合意形成しますか？' })] }),
        ],
      },
    ],
  })

  return doc
}

// ============================================
// メイン処理
// ============================================
async function main() {
  // 出力ディレクトリを作成
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log('テスト用ドキュメントを生成中...\n')

  // 履歴書を生成
  const resume = createResume()
  const resumeBuffer = await Packer.toBuffer(resume)
  const resumePath = `${OUTPUT_DIR}/resume_tanaka_taro.docx`
  writeFileSync(resumePath, resumeBuffer)
  console.log(`[履歴書] ${resumePath} (${(resumeBuffer.length / 1024).toFixed(1)} KB)`)

  // 求人票を生成
  const jobPosting = createJobPosting()
  const jobBuffer = await Packer.toBuffer(jobPosting)
  const jobPath = `${OUTPUT_DIR}/job_posting_ai_engineer.docx`
  writeFileSync(jobPath, jobBuffer)
  console.log(`[求人票] ${jobPath} (${(jobBuffer.length / 1024).toFixed(1)} KB)`)

  console.log('\n生成完了！')
  console.log('\nアプリでのアップロード方法:')
  console.log('  1. pnpm dev でアプリを起動')
  console.log('  2. Google OAuth でログイン')
  console.log('  3. 左サイドバー「履歴書」の「追加」→ resume_tanaka_taro.docx を選択')
  console.log('  4. 左サイドバー「求人票」の「追加」→ job_posting_ai_engineer.docx を選択')
}

main().catch(console.error)
