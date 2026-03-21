/**
 * AI Streaming Helpers
 *
 * OpenAI Responses API の SSE ストリーミング処理を共通化。
 * /generate と /generate-v2 の両方で使用される。
 */

// --- Error message constants (Japanese) ---
// M-9: 重複していたエラーメッセージ文字列を定数化

export const ERROR_MESSAGES = {
  RATE_LIMIT: 'AIサービスが混み合っています。しばらく待ってから再度お試しください。',
  AUTH_ERROR: 'AIサービスの認証エラーが発生しました。',
  TIMEOUT: 'AIの応答がタイムアウトしました。再度お試しください。',
  GENERIC: 'AI処理中にエラーが発生しました。しばらく待ってから再度お試しください。',
  USAGE_LIMIT: '今月のAIトークン上限に達しました。プランをアップグレードするか、来月までお待ちください。',
} as const

/**
 * OpenAI エラーをユーザー向けメッセージに変換
 */
export function mapOpenAIErrorToMessage(error: unknown): string {
  if (error instanceof Error) {
    if ('status' in error && (error as { status: number }).status === 429) {
      return ERROR_MESSAGES.RATE_LIMIT
    }
    if ('status' in error && (error as { status: number }).status === 401) {
      return ERROR_MESSAGES.AUTH_ERROR
    }
    if (error.message.includes('timeout')) {
      return ERROR_MESSAGES.TIMEOUT
    }
  }
  return ERROR_MESSAGES.GENERIC
}

// --- Stream processing types ---

export interface SSEWriter {
  writeSSE(event: { data: string }): Promise<void>
}

export interface StreamMetrics {
  turnId: string
  phase?: string
  m4: number
  m5: number
  m6: number
  m6_timedOut: boolean
  m7: number
}

interface OpenAIStreamEvent {
  type: string
  delta?: string
  response?: {
    id?: string
    usage?: { total_tokens?: number } | null
    error?: { message?: string }
  }
}

export interface StreamResult {
  totalTokensUsed: number
  responseId: string | null
}

/**
 * Direct ReadableStream SSE Response を作成する。
 * Hono の streamSSE() を使わず、TransformStream で直接 SSE を送信することで
 * Cloudflare Workers のバッファリングを回避し、レイテンシを改善する。
 */
export function createSSEResponse(
  handler: (writer: SSEWriter) => Promise<void>,
  ctx?: ExecutionContext,
): Response {
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  const sseWriter: SSEWriter = {
    writeSSE: async (event: { data: string }) => {
      const msg = `data: ${event.data}\n\n`
      await writer.write(encoder.encode(msg))
    },
  }

  const runPromise = handler(sseWriter)
    .catch((err) => {
      console.error('[createSSEResponse] handler error:', err instanceof Error ? err.message : String(err))
    })
    .finally(() => writer.close().catch(() => {}))

  if (ctx) {
    ctx.waitUntil(runPromise)
  }

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Content-Encoding': 'identity',
    },
  })
}

/**
 * OpenAI Responses API のストリームイベントを処理し、SSE としてクライアントに中継する。
 *
 * - response.output_text.delta → chunk イベント（初回のみ metrics イベントも送信）
 * - response.completed → トークン使用量とレスポンスIDを記録
 * - response.failed → エラーをthrow
 */
export async function processOpenAIStream(
  stream: SSEWriter,
  openaiStream: AsyncIterable<OpenAIStreamEvent>,
  metrics: StreamMetrics
): Promise<StreamResult> {
  let totalTokensUsed = 0
  let m8_openaiFirstChunk: number | null = null
  let responseId: string | null = null

  for await (const event of openaiStream) {
    if (event.type === 'response.output_text.delta') {
      const content = event.delta
      if (content) {
        if (!m8_openaiFirstChunk) {
          m8_openaiFirstChunk = Date.now()
          const m9_sseSent = Date.now()
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'metrics',
              data: {
                turnId: metrics.turnId,
                ...(metrics.phase !== undefined && { phase: metrics.phase }),
                m4: metrics.m4,
                m5: metrics.m5,
                m6: metrics.m6,
                m6_timedOut: metrics.m6_timedOut,
                m7: metrics.m7,
                m8: m8_openaiFirstChunk,
                m9: m9_sseSent,
              },
            }),
          })
        }
        await stream.writeSSE({
          data: JSON.stringify({ type: 'chunk', content }),
        })
      }
    } else if (event.type === 'response.completed') {
      responseId = event.response?.id ?? null
      totalTokensUsed = event.response?.usage?.total_tokens ?? 0
    } else if (event.type === 'response.failed') {
      throw new Error(event.response?.error?.message ?? 'OpenAI response failed')
    }
  }

  return { totalTokensUsed, responseId }
}
