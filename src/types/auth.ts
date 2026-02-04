/**
 * 認証関連の型定義
 */

/**
 * ユーザー情報
 */
export interface User {
  id: string
  email: string
  name: string | null
  picture: string | null
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  subscriptionPeriodEnd: string | null
  usage: UserUsage
}

/**
 * 使用量情報
 */
export interface UserUsage {
  sttMinutes: number
  aiTokens: number
  storageBytes: number
}

/**
 * ユーザー設定（クラウド同期）
 */
export interface UserSettings {
  theme: 'dark' | 'light'
  autoGenerateAI: boolean
  aiModel: string
  aiTemperature: number
  aiMaxTokens: number
  contextMinSimilarity: number
  contextTopK: number
  hasCustomDeepgramKey: boolean
  hasCustomOpenaiKey: boolean
}

/**
 * サブスクリプションティア
 */
export type SubscriptionTier = 'free' | 'pro' | 'enterprise'

/**
 * サブスクリプション状態
 */
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing'

/**
 * 認証状態
 */
export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  settings: UserSettings | null
  error: string | null
}

/**
 * JWTペイロード
 */
export interface JWTPayload {
  sub: string
  email: string
  name: string | null
  picture: string | null
  iat: number
  exp: number
}

/**
 * 認証トークン
 */
export interface AuthTokens {
  accessToken: string
  expiresAt: number
}

/**
 * 認証コールバックパラメータ
 */
export interface AuthCallbackParams {
  token: string
  error?: string
}

/**
 * API レスポンス
 */
export interface AuthMeResponse {
  user: User
  settings: UserSettings | null
}

/**
 * プラン制限
 */
export interface PlanLimits {
  sttMinutesMonthly: number
  aiTokensMonthly: number
  storageBytesTotal: number
  maxDocuments: number
  customApiKeys: boolean
  prioritySupport: boolean
}

/**
 * サブスクリプションプラン
 */
export interface SubscriptionPlan {
  id: SubscriptionTier
  name: string
  priceMonthly: number
  priceYearly: number | null
  limits: PlanLimits
}

/**
 * 認証サービスの初期化状態
 */
export const DEFAULT_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  user: null,
  settings: null,
  error: null,
}
