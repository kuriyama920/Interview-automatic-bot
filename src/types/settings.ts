/**
 * アプリケーション設定の型定義
 */

export interface AppSettings {
  // API設定
  deepgramApiKey: string
  openaiApiKey: string

  // UI設定
  theme: 'dark' | 'light'
  autoGenerateAI: boolean

  // AI設定
  aiModel: 'gpt-4o' | 'gpt-4-turbo' | 'gpt-3.5-turbo'
  aiTemperature: number
  aiMaxTokens: number

  // RAG設定
  contextMinSimilarity: number
  contextTopK: number

  // メタデータ
  lastUpdated: number
  version: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  // API設定（空文字 = 環境変数から取得）
  deepgramApiKey: '',
  openaiApiKey: '',

  // UI設定
  theme: 'dark',
  autoGenerateAI: true,

  // AI設定
  aiModel: 'gpt-4o',
  aiTemperature: 0.7,
  aiMaxTokens: 1000,

  // RAG設定
  contextMinSimilarity: 0.7,
  contextTopK: 3,

  // メタデータ
  lastUpdated: Date.now(),
  version: '1.0.0',
}

export type SettingsKey = keyof AppSettings
