/**
 * 認証ユーティリティ
 * Google OAuth + JWT トークン管理
 *
 * Cloudflare Workers: Web Crypto API を使用（非同期）
 */

import type { Env } from '../types'

// JWT ペイロード型
export interface JWTPayload {
  sub: string
  iat: number
  exp: number
}

// Google OAuth トークンレスポンス
interface GoogleTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope: string
  id_token: string
}

// Google ユーザー情報
export interface GoogleUserInfo {
  id: string
  email: string
  verified_email: boolean
  name: string
  given_name: string
  family_name: string
  picture: string
}

/**
 * Google OAuth URLを生成
 */
export function generateGoogleAuthUrl(
  redirectUri: string,
  state: string,
  env: Env
): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    state,
    prompt: 'consent',
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/**
 * 認証コードをトークンに交換
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  env: Env
): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code: ${error}`)
  }

  return response.json() as Promise<GoogleTokenResponse>
}

/**
 * Google ユーザー情報を取得
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error('Failed to get user info')
  }

  return response.json() as Promise<GoogleUserInfo>
}

/**
 * HMAC-SHA256 署名を作成 (Web Crypto API)
 */
async function createHmacSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  // ArrayBuffer → base64url
  const bytes = new Uint8Array(signature)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * JWTトークンを生成
 */
export async function generateJWT(
  payload: Pick<JWTPayload, 'sub'>,
  jwtSecret: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24, // 24時間有効
  }

  const encoder = new TextEncoder()
  const base64Header = arrayBufferToBase64url(encoder.encode(JSON.stringify(header)))
  const base64Payload = arrayBufferToBase64url(encoder.encode(JSON.stringify(fullPayload)))
  const signature = await createHmacSignature(`${base64Header}.${base64Payload}`, jwtSecret)

  return `${base64Header}.${base64Payload}.${signature}`
}

/**
 * JWTトークンを検証
 */
export async function verifyJWT(token: string, jwtSecret: string): Promise<JWTPayload | null> {
  try {
    const [header, payload, signature] = token.split('.')
    if (!header || !payload || !signature) return null

    // 署名検証
    const expectedSignature = await createHmacSignature(`${header}.${payload}`, jwtSecret)

    // タイミングセーフ比較
    if (signature.length !== expectedSignature.length) return null

    const encoder = new TextEncoder()
    const sigBytes = encoder.encode(signature)
    const expectedBytes = encoder.encode(expectedSignature)

    if (sigBytes.length !== expectedBytes.length) return null

    // crypto.timingSafeEqual は nodejs_compat で利用可能
    const crypto_node = await import('crypto')
    if (!crypto_node.timingSafeEqual(sigBytes, expectedBytes)) {
      return null
    }

    // ペイロードをデコード
    const decoded = JSON.parse(base64urlToString(payload)) as JWTPayload

    // 有効期限チェック
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return decoded
  } catch {
    return null
  }
}

/**
 * リクエストからユーザーを取得
 */
export async function getUserFromRequest(
  req: Request,
  jwtSecret: string
): Promise<JWTPayload | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  return verifyJWT(token, jwtSecret)
}

// --- ヘルパー ---

function arrayBufferToBase64url(buffer: Uint8Array): string {
  let binary = ''
  for (const byte of buffer) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlToString(base64url: string): string {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return atob(padded)
}
