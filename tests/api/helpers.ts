/**
 * バックエンドAPI テスト用ヘルパー
 * VercelRequest/Response のモック生成
 */

import { vi } from 'vitest'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { IncomingHttpHeaders } from 'http'

/**
 * モック VercelRequest を生成
 */
export function createMockRequest(options: {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  query?: Record<string, string>
} = {}): VercelRequest {
  const headers: IncomingHttpHeaders = {
    'content-type': 'application/json',
    ...options.headers,
  }

  return {
    method: options.method || 'GET',
    body: options.body || {},
    headers,
    query: options.query || {},
  } as unknown as VercelRequest
}

/**
 * モック VercelResponse を生成
 * status(), json(), setHeader(), write(), end() をチェーン可能
 */
export function createMockResponse(): VercelResponse & {
  _status: number
  _json: unknown
  _headers: Record<string, string>
  _written: string[]
  _ended: boolean
} {
  const res = {
    _status: 200,
    _json: null as unknown,
    _headers: {} as Record<string, string>,
    _written: [] as string[],
    _ended: false,

    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code
      return this
    }),
    json: vi.fn(function (this: typeof res, data: unknown) {
      this._json = data
      this._ended = true
      return this
    }),
    setHeader: vi.fn(function (this: typeof res, name: string, value: string) {
      this._headers[name] = value
      return this
    }),
    write: vi.fn(function (this: typeof res, data: string) {
      this._written.push(data)
      return true
    }),
    end: vi.fn(function (this: typeof res) {
      this._ended = true
      return this
    }),
    headersSent: false,
  }

  return res as unknown as VercelResponse & typeof res
}

/**
 * 有効な JWT トークンを生成（テスト用）
 */
export function createTestJWT(payload?: Partial<{
  sub: string
  email: string
  name: string
  picture: string
}>): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    sub: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    picture: 'https://example.com/pic.jpg',
    iat: now,
    exp: now + 3600,
    ...payload,
  }

  const crypto = require('crypto')
  const secret = 'test-jwt-secret'
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url')
  const base64Payload = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url')

  return `${base64Header}.${base64Payload}.${signature}`
}
