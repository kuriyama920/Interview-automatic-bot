/**
 * 許可されたオリジンの共通定義
 * CORS、returnUrl検証、successUrl/cancelUrl検証で共有
 */

export const ALLOWED_ORIGINS = [
  // 本番環境
  'https://interview-bot.vercel.app',
  'https://interview-bot-dashboard.vercel.app',
  // 開発環境
  'http://localhost:3000',
  'http://localhost:5173',
] as const

/**
 * URLのオリジンが許可リストに含まれるか検証
 */
export function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ALLOWED_ORIGINS.some(
      (allowed) => parsed.origin === new URL(allowed).origin
    )
  } catch {
    return false
  }
}
