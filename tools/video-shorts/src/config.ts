/**
 * 設定・環境変数・ブランド定数
 */

import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { BrandColors, FeatureInfo, TemplateType } from './types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// .env 読み込み
config({ path: resolve(__dirname, '..', '.env') })

/**
 * 環境変数を安全に取得
 */
function getEnv(key: string, required = true): string {
  const value = process.env[key]
  if (!value && required) {
    throw new Error(`環境変数 ${key} が設定されていません`)
  }
  return value ?? ''
}

/**
 * 環境変数を遅延取得（使用時にバリデーション）
 */
function lazyEnv(key: string): () => string {
  return () => getEnv(key)
}

/** ブランドカラー（既存デザインシステム準拠） */
export const BRAND_COLORS: BrandColors = {
  accent: '#3b82f6',
  accentHover: '#2563eb',
  background: '#ffffff',
  backgroundSecondary: '#f9fafb',
  text: '#111827',
  textSecondary: '#6b7280',
  success: '#10b981',
  error: '#ef4444',
} as const

/** 動画仕様 */
export const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 30,
  get durationInFrames() {
    return this.fps * this.durationSeconds
  },
} as const

/** ブランド情報 */
export const BRAND = {
  name: 'InterviewBot',
  tagline: 'AIリアルタイム面接支援',
  websiteUrl: process.env.WEBSITE_URL ?? 'https://interviewbot.app',
  downloadUrl: process.env.DOWNLOAD_URL ?? 'https://interviewbot.app/download',
  font: 'Noto Sans JP',
} as const

/** 出力ディレクトリ */
export const OUTPUT_DIR = resolve(
  __dirname,
  '..',
  process.env.VIDEO_OUTPUT_DIR ?? './output'
)

/** ドライランモード */
export const DRY_RUN = process.env.DRY_RUN === 'true'

/** ログレベル */
export const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'

/** OpenAI設定 */
export const OPENAI = {
  apiKey: lazyEnv('OPENAI_API_KEY'),
  model: 'gpt-4o-mini',
} as const

/** YouTube API設定 */
export const YOUTUBE = {
  clientId: lazyEnv('YOUTUBE_CLIENT_ID'),
  clientSecret: lazyEnv('YOUTUBE_CLIENT_SECRET'),
  refreshToken: lazyEnv('YOUTUBE_REFRESH_TOKEN'),
  channelId: lazyEnv('YOUTUBE_CHANNEL_ID'),
} as const

/** X/Twitter API設定 */
export const TWITTER = {
  apiKey: lazyEnv('TWITTER_API_KEY'),
  apiSecret: lazyEnv('TWITTER_API_SECRET'),
  accessToken: lazyEnv('TWITTER_ACCESS_TOKEN'),
  accessTokenSecret: lazyEnv('TWITTER_ACCESS_TOKEN_SECRET'),
} as const

/** TikTok API設定 */
export const TIKTOK = {
  clientKey: lazyEnv('TIKTOK_CLIENT_KEY'),
  clientSecret: lazyEnv('TIKTOK_CLIENT_SECRET'),
  accessToken: lazyEnv('TIKTOK_ACCESS_TOKEN'),
} as const

/** Instagram API設定 */
export const INSTAGRAM = {
  accessToken: lazyEnv('INSTAGRAM_ACCESS_TOKEN'),
  businessAccountId: lazyEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID'),
} as const

/** 曜日 → テンプレートマッピング（0=日曜） */
export const DAILY_TEMPLATE_MAP: Record<number, TemplateType> = {
  0: 'feature-highlight',
  1: 'feature-highlight',
  2: 'tip-of-day',
  3: 'demo-showcase',
  4: 'stats-promo',
  5: 'testimonial',
  6: 'tip-of-day',
}

/** InterviewBot 機能リスト（テンプレートコンテンツ用） */
export const FEATURES: readonly FeatureInfo[] = [
  {
    name: 'リアルタイム文字起こし',
    description: '面接中の会話をリアルタイムでテキスト化。Deepgram AIが高精度で日本語を認識',
    benefit: '面接官の質問を正確に把握',
    icon: '🎙️',
  },
  {
    name: 'AI回答提案',
    description: '面接官の質問に対して、GPT-5 Miniが最適な回答をリアルタイムで提案',
    benefit: '言葉に詰まることがなくなる',
    icon: '🤖',
  },
  {
    name: 'システム音声キャプチャ',
    description: 'オンライン面接の相手の音声も自動認識。マイクだけでなくPC音声も文字起こし',
    benefit: 'オンライン面接に完全対応',
    icon: '🔊',
  },
  {
    name: 'RAGコンテキスト',
    description: '履歴書・職務経歴書をアップロードすると、あなたの経験に基づいた回答を生成',
    benefit: 'パーソナライズされた回答',
    icon: '📄',
  },
  {
    name: '想定質問リスト',
    description: 'よくある面接質問20問に対する模範回答をAIが自動生成。事前準備を効率化',
    benefit: '面接準備時間を大幅短縮',
    icon: '❓',
  },
  {
    name: 'ストリーミング回答',
    description: '回答がリアルタイムで画面に表示。文字が流れるように現れるので、面接中に自然に確認可能',
    benefit: '面接中でも自然に参照',
    icon: '⚡',
  },
  {
    name: 'セキュアなデータ保存',
    description: 'APIキーや個人情報はAES暗号化で安全に保存。クラウドに個人データを送信しない選択も可能',
    benefit: '個人情報を安全に管理',
    icon: '🔒',
  },
  {
    name: 'サブスクリプション管理',
    description: 'Free/Pro/Maxの3プランから選択。Stripeで安全な決済を提供',
    benefit: '用途に合わせた料金プラン',
    icon: '💳',
  },
  {
    name: 'ワンクリック認証',
    description: 'Googleアカウントでワンクリックログイン。面倒な登録手続き不要',
    benefit: 'すぐに使い始められる',
    icon: '🔑',
  },
  {
    name: 'デスクトップアプリ',
    description: 'Windows対応のネイティブアプリ。ブラウザ不要で面接中も軽快に動作',
    benefit: '安定した動作環境',
    icon: '💻',
  },
] as const

/** 面接Tipsカテゴリ */
export const TIP_CATEGORIES = [
  '面接準備',
  'ボディランゲージ',
  'よくある質問対策',
  'フォローアップ',
  '自己PR',
  '志望動機',
  '逆質問',
  'オンライン面接',
  '第一印象',
  '話し方のコツ',
] as const

/** トレンドデータ取得を有効化（環境変数で制御、デフォルト有効） */
export const ENABLE_TRENDS = process.env.ENABLE_TRENDS !== 'false'

/** Apify API設定（TikTok Trends Scraper用） */
export const APIFY = {
  apiToken: process.env.APIFY_API_TOKEN ?? '',
  tiktokTrendsActorId: 'clockworks~tiktok-trends-scraper',
} as const

/** トレンドフィルタリング用キーワード（career/interview関連） */
export const TREND_KEYWORDS = [
  '転職',
  '面接',
  '就活',
  '就職',
  '採用',
  '履歴書',
  '職務経歴書',
  'キャリア',
  '内定',
  '退職',
  '年収',
  '給与',
  '人事',
  'AI面接',
  'リモートワーク',
  'テレワーク',
  '副業',
  'フリーランス',
  '起業',
  'スキルアップ',
  'リスキリング',
  'DX',
  'エンジニア',
  'プログラミング',
] as const
