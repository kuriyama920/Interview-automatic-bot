/**
 * 許可されたオリジンの共通定義
 * CORS、returnUrl検証、successUrl/cancelUrl検証で共有
 */

export const ALLOWED_ORIGINS = [
  // 本番環境
  'https://interview-bot-web.pages.dev',
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
    // {hash}.interview-bot-web.pages.dev 形式
    // セキュリティ: 8文字hex + プロジェクト名の形式のみ許可（任意サブドメインは拒否）
    const hostname = parsed.hostname
    if (hostname.endsWith('.interview-bot-web.pages.dev')) {
      const subdomain = hostname.replace('.interview-bot-web.pages.dev', '')
      // Cloudflare Pagesプレビューは {8char-hex}.project.pages.dev 形式
      if (/^[a-f0-9]{8}$/.test(subdomain)) {
        return true
      }
      return false
    }

    return false
  } catch {
    return false
  }
}
