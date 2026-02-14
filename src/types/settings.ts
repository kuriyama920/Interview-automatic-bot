/**
 * アプリケーション設定の型定義
 */

// 音声ソースの種類
export type AudioSource = 'mic' | 'system' | 'both'

export interface AppSettings {
  // API設定
  deepgramApiKey: string
  openaiApiKey: string

  // UI設定
  theme: 'dark' | 'light'
  autoGenerateAI: boolean

  // 音声キャプチャ設定
  audioSource: AudioSource

  // AI設定
  aiModel: 'gpt-5-nano' | 'gpt-5-mini' | 'gpt-5' | 'gpt-4o'
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

  // 音声キャプチャ設定
  audioSource: 'system',

  // AI設定
  aiModel: 'gpt-5-nano',
  aiTemperature: 0.7,
  aiMaxTokens: 2000,

  // RAG設定
  contextMinSimilarity: 0.7,
  contextTopK: 3,

  // メタデータ
  lastUpdated: Date.now(),
  version: '1.0.0',
}

export type SettingsKey = keyof AppSettings
