/**
 * 許可されたオリジンの共通定義
 * CORS、returnUrl検証、successUrl/cancelUrl検証で共有
 */

export const ALLOWED_ORIGINS = [
  // 本番環境
  'https://interview-bot.vercel.app',
  'https://interviewbot.vercel.app',
  'https://interview-bot-dashboard.vercel.app',
  // 開発環境
  'http://localhost:3000',
  'http://localhost:5173',
] as const

/**
 * URLのオリジンが許可リストに含まれるか検証
 * Vercelデプロイメント（プレビュー含む）も許可
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

    // Vercelデプロイメント（*.vercel.app）を許可
    // 例: kuriyama-natos-projects.vercel.app, xxx-git-branch-yyy.vercel.app
    const hostname = parsed.hostname
    if (hostname.endsWith('.vercel.app')) {
      return true
    }

    return false
  } catch {
    return false
  }
}
