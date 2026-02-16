/**
 * ショート動画生成システム 型定義
 */

/** テンプレートタイプ */
export type TemplateType =
  | 'feature-highlight'
  | 'demo-showcase'
  | 'stats-promo'
  | 'tip-of-day'
  | 'testimonial'

/** 投稿プラットフォーム */
export type Platform = 'youtube' | 'twitter' | 'tiktok' | 'instagram'

/** ブランドカラー定義 */
export interface BrandColors {
  readonly accent: string
  readonly accentHover: string
  readonly background: string
  readonly backgroundSecondary: string
  readonly text: string
  readonly textSecondary: string
  readonly success: string
  readonly error: string
}

/** 動画テンプレートに渡すProps */
export interface VideoTemplateProps {
  /** メインヘッドライン（15文字以内） */
  headline: string
  /** サブヘッドライン（25文字以内） */
  subheadline: string
  /** 本文テキスト行（各20文字以内） */
  bodyText: readonly string[]
  /** CTA テキスト（15文字以内） */
  ctaText: string
  /** テンプレートタイプ */
  templateType: TemplateType
  /** テンプレート固有データ */
  metadata: Record<string, unknown>
}

/** AIが生成するコンテンツ */
export interface GeneratedContent {
  headline: string
  subheadline: string
  bodyText: string[]
  ctaText: string
  hashtags: string[]
  description: string
  templateType: TemplateType
}

/** 動画メタデータ（アップロード時） */
export interface VideoMetadata {
  title: string
  description: string
  tags: string[]
  hashtags: string[]
  templateType: TemplateType
  language: 'ja'
}

/** アップロード結果 */
export interface UploadResult {
  platform: Platform
  success: boolean
  videoId?: string
  url?: string
  error?: string
}

/** プラットフォームアップローダーインターフェース */
export interface PlatformUploader {
  readonly name: Platform
  upload(videoPath: string, metadata: VideoMetadata): Promise<UploadResult>
  validateCredentials(): Promise<boolean>
}

/** 投稿履歴レコード */
export interface HistoryRecord {
  id: string
  date: string
  templateType: TemplateType
  videoFile: string
  content: GeneratedContent
  uploads: UploadResult[]
  createdAt: string
}

/** コンテンツカレンダーエントリ */
export interface CalendarEntry {
  date: string
  templateType: TemplateType
  featureIndex: number
  tipIndex: number
  generated: boolean
  posted: Record<Platform, boolean>
}

/** CLI コマンド */
export type CliCommand =
  | 'generate'
  | 'generate-and-post'
  | 'calendar'
  | 'history'
  | 'status'

/** CLI オプション */
export interface CliOptions {
  command: CliCommand
  template?: TemplateType
  platforms?: Platform[]
  dryRun?: boolean
}

/** InterviewBot 機能情報（テンプレート用） */
export interface FeatureInfo {
  name: string
  description: string
  benefit: string
  icon: string
}

/** Google Trends トレンド項目 */
export interface TrendItem {
  /** トレンドのタイトル/クエリ */
  readonly title: string
  /** トラフィック量（例: "100K+"） */
  readonly formattedTraffic: string
  /** 関連するクエリ */
  readonly relatedQueries: readonly string[]
}

/** TikTok トレンド項目 */
export interface TikTokTrendItem {
  /** ハッシュタグ名 */
  readonly name: string
  /** 再生回数 */
  readonly views: string
  /** トレンドカテゴリ */
  readonly category: string
}

/** トレンドコンテキスト（AI生成に注入） */
export interface TrendContext {
  /** 取得日時 */
  readonly fetchedAt: string
  /** Google Trends: career/interview関連のトレンド（最大3件） */
  readonly relevantTrends: readonly TrendItem[]
  /** Google Trends: 一般的な日本のトレンド（最大5件） */
  readonly generalTrends: readonly TrendItem[]
  /** TikTok: トレンドハッシュタグ（最大5件） */
  readonly tiktokTrends: readonly TikTokTrendItem[]
  /** トレンドデータが存在するか */
  readonly hasTrends: boolean
}
