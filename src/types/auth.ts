/**
 * 認証関連の型定義
 */

/**
 * 面接プロフィール（構造化された個人情報）
 */
export interface InterviewProfile {
  fullName: string
  nameReading?: string
  currentCompany?: string
  currentPosition?: string
  previousCompanies?: string[]
  targetCompany?: string
  targetPosition?: string
  technologies?: string[]
  certifications?: string[]
  education?: string
  yearsOfExperience?: number
  additionalNotes?: string
}

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
  interviewProfile: InterviewProfile | null
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
}

/**
 * サブスクリプションティア
 */
export type SubscriptionTier = 'free' | 'pro' | 'max'

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
  settings: UserSettings | null
}

