/**
 * アプリケーション設定
 * ビルド時に注入される環境変数を使用（process.env に依存しない）
 *
 * electron-vite の MAIN_VITE_* プレフィックスで import.meta.env に注入される
 */

const DEFAULT_API_BASE_URL =
  'https://interview-bot-api.interviewautomaticbot92.workers.dev'

export interface AppConfig {
  apiBaseUrl: string
}

export function getConfig(): AppConfig {
  const raw = import.meta.env?.MAIN_VITE_API_BASE_URL
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  const apiBaseUrl = trimmed !== '' && trimmed !== 'undefined' ? trimmed : DEFAULT_API_BASE_URL

  return {
    apiBaseUrl,
  }
}
