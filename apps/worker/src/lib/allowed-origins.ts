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
    // {hash}.interview-bot-web.pages.dev 形式のみ許可
    //
    // セキュリティ注意: このワイルドカード許可により、プレビューデプロイメントが
    // 本番APIにアクセス可能です。本番デプロイ時は以下を実施すること:
    // 1. Cloudflare Pages設定でプレビューデプロイメントを信頼メンバーに制限
    //    (Settings > Build & Deploy > Preview deployments > Restrict to team members)
    // 2. 必要に応じて PREVIEW_BRANCH_ALLOWLIST 環境変数で許可ブランチを制御
    const hostname = parsed.hostname
    if (hostname.endsWith('.interview-bot-web.pages.dev')) {
      return true
    }

    return false
  } catch {
    return false
  }
}
