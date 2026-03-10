/**
 * Web チェックアウトフロー用 API ユーティリティ
 * 認証セッション作成、ポーリング、Stripe Checkout 作成
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.interviewbot.app'

export interface AuthSessionResponse {
  sessionId: string
  authUrl: string
  expiresAt: string
}

export interface AuthPollResponse {
  status: 'pending' | 'completed' | 'consumed' | 'error' | 'expired'
  token?: string
  user?: {
    id: string
    email: string
    name: string
    picture: string
    subscriptionTier: string
  }
  error?: string
}

export interface CheckoutResponse {
  url: string
}

// プランID → Stripe Price ID マッピング
// subscription_plans テーブルの値と一致させる
const PLAN_PRICE_MAP: Record<string, string> = {
  pro: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || 'price_1T5jdGJYscx9GZNhlwROF46u',
  max: process.env.NEXT_PUBLIC_STRIPE_MAX_PRICE_ID || 'price_1T5jcKJYscx9GZNhz5epevXW',
}

export function getPriceIdForPlan(planId: string): string | null {
  return PLAN_PRICE_MAP[planId] || null
}

/**
 * 認証セッションを作成
 * returnUrl を渡すと、OAuth完了後にそのURLにリダイレクトされる
 */
export async function createAuthSession(
  returnUrl: string
): Promise<AuthSessionResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnUrl }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || '認証セッションの作成に失敗しました')
  }

  return res.json()
}

/**
 * 認証セッションのステータスをポーリング
 * completed の場合、JWT と user データを返す
 */
export async function pollAuthSession(
  sessionId: string
): Promise<AuthPollResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/session?id=${encodeURIComponent(sessionId)}`)

  if (res.status === 410) {
    return { status: 'expired', error: 'セッションが期限切れです' }
  }

  if (!res.ok) {
    throw new Error('認証セッションの取得に失敗しました')
  }

  return res.json()
}

/**
 * Stripe Checkout Session を作成
 * 成功すると Stripe の Checkout URL を返す
 */
export async function createStripeCheckout(
  token: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string
): Promise<CheckoutResponse> {
  const res = await fetch(`${API_BASE_URL}/api/stripe/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ priceId, successUrl, cancelUrl }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'チェックアウトセッションの作成に失敗しました')
  }

  return res.json()
}
