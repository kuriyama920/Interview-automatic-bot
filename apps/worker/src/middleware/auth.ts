/**
 * JWT 認証ミドルウェア
 * Authorization: Bearer <token> ヘッダーからJWTを検証
 */

import { createMiddleware } from 'hono/factory'
import type { Env, Variables } from '../types'
import { verifyJWT } from '../lib/auth'

/**
 * JWT認証必須ミドルウェア
 * 検証成功時は c.get('jwtPayload') でペイロードを取得可能
 */
export const authRequired = createMiddleware<{
  Bindings: Env
  Variables: Variables
}>(async (c, next) => {
  const authHeader = c.req.header('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.slice(7)
  const payload = await verifyJWT(token, c.env.JWT_SECRET)

  if (!payload) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('jwtPayload', payload)
  await next()
})
