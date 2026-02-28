/**
 * 許可されたオリジンの共通定義
 * CORS、returnUrl検証、successUrl/cancelUrl検証で共有
 */

export const ALLOWED_ORIGINS = [
  // 本番環境
  'https://interviewbot.app',
  'https://www.interviewbot.app',
  // 開発環境
  'http://localhost:3000',
  'http://localhost:5173',
] as const

/**
 * URLのオリジンが許可リストに含まれるか検証
 * Cloudflare Pagesデプロイメント（プレビュー含む）も許可
 */
export function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url)
    const origin = parsed.origin

    // 明示的な許可リスト
    const isExplicitlyAllowed = ALLOWED_ORIGINS.some(
      (allowed) => origin === new URL(allowed).origin
    )
    if (isExplicitlyAllowed) return true

    // Cloudflare Pagesプレビューデプロイメント
    const hostname = parsed.hostname
    if (hostname.endsWith('.pages.dev') && hostname.includes('interview-bot')) {
      return true
    }

    return false
  } catch {
    return false
  }
}
