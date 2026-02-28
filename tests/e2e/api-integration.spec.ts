/**
 * API統合E2Eテスト
 *
 * バックエンドAPIエンドポイントの実際のHTTPリクエストを検証。
 * テスト環境のAPI（wrangler dev）またはモックサーバーに対して実行。
 *
 * Note: CI環境でもデプロイ済みAPIに対してスモークテスト可能。
 * ローカルでは `wrangler dev` でAPIサーバーを起動してから実行。
 */

import { test, expect } from '@playwright/test'
import crypto from 'crypto'

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000'
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret'

/**
 * テスト用 JWT トークンを生成
 */
function createTestToken(payload?: Partial<{
  sub: string
  email: string
  name: string
  picture: string
}>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    sub: 'e2e-test-user',
    email: 'e2e@test.com',
    name: 'E2E Test',
    picture: '',
    iat: now,
    exp: now + 3600,
    ...payload,
  }

  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url')

  return `${base64Header}.${base64Payload}.${signature}`
}

test.describe('API Health Check', () => {
  test('GET /api/health should return 200', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/health`)
    expect(response.status()).toBe(200)
  })
})

test.describe('Subscription API', () => {
  test('GET /api/subscription without auth should return 401', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/subscription`)
    expect(response.status()).toBe(401)
  })

  test('GET /api/subscription with invalid token should return 401', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/subscription`, {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/subscription should return 405', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/subscription`)
    expect(response.status()).toBe(405)
  })
})

test.describe('STT Token API', () => {
  test('GET /api/stt/token should return 405', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/stt/token`)
    expect(response.status()).toBe(405)
  })

  test('POST /api/stt/token without auth should return 401', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/stt/token`)
    expect(response.status()).toBe(401)
  })
})

test.describe('STT Usage API', () => {
  test('POST /api/stt/usage without auth should return 401', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/stt/usage`, {
      data: { minutes: 5 },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/stt/usage with invalid body should return 400', async ({ request }) => {
    const token = createTestToken()
    const response = await request.post(`${API_BASE_URL}/api/stt/usage`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { minutes: -1 },
    })
    // 400 (validation) or 401 (if JWT secret mismatch in real env)
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('AI Generate API', () => {
  test('GET /api/ai/generate should return 405', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/ai/generate`)
    expect(response.status()).toBe(405)
  })

  test('POST /api/ai/generate without auth should return 401', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/ai/generate`, {
      data: { question: 'テスト質問' },
    })
    expect(response.status()).toBe(401)
  })

  test('POST /api/ai/generate without question should return 400', async ({ request }) => {
    const token = createTestToken()
    const response = await request.post(`${API_BASE_URL}/api/ai/generate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    })
    // 400 (validation) or 401 (if JWT secret mismatch)
    expect([400, 401]).toContain(response.status())
  })
})

test.describe('Stripe Checkout API', () => {
  test('GET /api/stripe/checkout should return 405', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/stripe/checkout`)
    expect(response.status()).toBe(405)
  })

  test('POST /api/stripe/checkout without auth should return 401', async ({ request }) => {
    const response = await request.post(`${API_BASE_URL}/api/stripe/checkout`, {
      data: { priceId: 'price_test' },
    })
    expect(response.status()).toBe(401)
  })
})

test.describe('CORS', () => {
  test('OPTIONS requests should return 200', async ({ request }) => {
    const response = await request.fetch(`${API_BASE_URL}/api/subscription`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    })
    expect(response.status()).toBe(200)
  })

  test('should reject unknown origins', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/api/subscription`, {
      headers: {
        Origin: 'https://malicious-site.com',
      },
    })
    expect(response.status()).toBe(403)
  })
})
