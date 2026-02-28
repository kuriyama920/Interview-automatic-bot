/**
 * STT ルート
 * POST /api/stt/token - Deepgram 一時トークン発行
 * POST /api/stt/usage - STT 使用量報告
 */

import { Hono } from 'hono'
import type { Env, Variables } from '../types'
import { createSupabaseAdmin } from '../lib/supabase'
import { authRequired } from '../middleware/auth'
import { checkUsageLimit, recordUsage } from '../lib/usage'
import { generateTemporaryToken, DEFAULT_STT_CONFIG } from '../lib/deepgram'

const app = new Hono<{ Bindings: Env; Variables: Variables }>()

const MAX_SESSION_MINUTES = 120

app.use('*', authRequired)

app.post('/token', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')

  const usage = await checkUsageLimit(supabase, userId, 'stt')
  if (!usage.allowed) {
    return c.json(
      {
        error:
          '今月の音声認識の利用上限に達しました。プランをアップグレードするか、来月までお待ちください。',
        usage: { used: usage.used, limit: usage.limit, remaining: 0 },
      },
      429
    )
  }

  try {
    const result = await generateTemporaryToken(c.env.DEEPGRAM_API_KEY, 600)
    return c.json({
      success: true,
      token: result.token,
      expiresIn: result.expiresIn,
      config: DEFAULT_STT_CONFIG,
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: usage.remaining,
      },
    })
  } catch (error) {
    console.error('Deepgram token generation error:', error)
    return c.json(
      {
        error:
          '音声認識サービスへの接続に失敗しました。しばらく経ってから再度お試しください。',
      },
      502
    )
  }
})

app.post('/usage', async (c) => {
  const supabase = createSupabaseAdmin(c.env)
  const { sub: userId } = c.get('jwtPayload')
  const body = await c.req.json<{ minutes?: number }>()
  const { minutes } = body

  if (
    typeof minutes !== 'number' ||
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    minutes > MAX_SESSION_MINUTES
  ) {
    return c.json(
      { error: `minutes must be a positive number up to ${MAX_SESSION_MINUTES}` },
      400
    )
  }

  const cappedMinutes = Math.ceil(minutes)

  await recordUsage(supabase, userId, 'stt', cappedMinutes, 'minutes', {
    reportedMinutes: minutes,
    cappedMinutes,
  })

  const usage = await checkUsageLimit(supabase, userId, 'stt')

  return c.json({
    success: true,
    recorded: cappedMinutes,
    usage: {
      used: usage.used,
      limit: usage.limit,
      remaining: usage.remaining,
    },
  })
})

export default app
