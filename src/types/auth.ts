/**
 * 認証固有の型定義
 *
 * 共通型（User, AuthState, SubscriptionTier など）は shared.ts を参照。
 */

import type { User } from './shared'

/**
 * 認証トークン
 */
export interface AuthTokens {
  accessToken: string
  expiresAt: number
}

/**
 * API レスポンス
 */
export interface AuthMeResponse {
  user: User
}
