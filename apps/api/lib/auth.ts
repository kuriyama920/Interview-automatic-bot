/**
 * 認証ユーティリティ
 * Google OAuth + JWT トークン管理
 */

import { VercelRequest } from '@vercel/node'
import crypto from 'crypto'
import { getEnv } from './env'

// 環境変数を遅延取得（モジュールロード時ではなく使用時に取得）
const getJwtSecret = () => getEnv('JWT_SECRET')
const getGoogleClientId = () => getEnv('GOOGLE_CLIENT_ID')
const getGoogleClientSecret = () => getEnv('GOOGLE_CLIENT_SECRET')

// JWT ペイロード型
export interface JWTPayload {
  sub: string // ユーザーID
  email: string
  name: string
  picture: string
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
export function generateGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
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
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: getGoogleClientId(),
      client_secret: getGoogleClientSecret(),
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
 * JWTトークンを生成（簡易実装）
 * 本番環境では jose などのライブラリを使用推奨
 */
export function generateJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24 * 7, // 7日間有効
  }

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  const signature = createHmacSignature(`${base64Header}.${base64Payload}`, getJwtSecret())

  return `${base64Header}.${base64Payload}.${signature}`
}

/**
 * JWTトークンを検証
 */
export function verifyJWT(token: string): JWTPayload | null {
  try {
    const [header, payload, signature] = token.split('.')

    // 署名検証
    const expectedSignature = createHmacSignature(`${header}.${payload}`, getJwtSecret())
    if (signature !== expectedSignature) {
      return null
    }

    // ペイロードをデコード
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JWTPayload

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
export function getUserFromRequest(req: VercelRequest): JWTPayload | null {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)
  return verifyJWT(token)
}

/**
 * HMAC-SHA256 署名を作成
 */
function createHmacSignature(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}
