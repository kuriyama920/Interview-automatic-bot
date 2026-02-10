/**
 * Deepgram クライアント (Phase 8)
 * 一時トークン発行のみ。音声処理はクライアントが直接 Deepgram に接続。
 */

/**
 * Deepgram API キーを取得
 */
function getDeepgramApiKey(): string {
  const key = process.env.DEEPGRAM_API_KEY
  if (!key) {
    throw new Error('DEEPGRAM_API_KEY environment variable is not set')
  }
  return key
}

export interface DeepgramTemporaryToken {
  token: string
  expiresIn: number
}

/**
 * Deepgram 一時トークンを発行
 *
 * Deepgram の /v1/auth/grant エンドポイントを使用して
 * 短命のアクセストークンを生成する。
 *
 * @param ttlSeconds トークン有効期限（秒）。デフォルト 600（10分）
 */
export async function generateTemporaryToken(
  ttlSeconds: number = 600
): Promise<DeepgramTemporaryToken> {
  const apiKey = getDeepgramApiKey()

  const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ttl_seconds: ttlSeconds }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Deepgram token generation failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  return {
    token: data.access_token,
    expiresIn: ttlSeconds,
  }
}

/**
 * デフォルトの STT 設定
 */
export const DEFAULT_STT_CONFIG = {
  model: 'nova-2',
  language: 'ja',
  encoding: 'linear16',
  sampleRate: 16000,
  channels: 1,
  smartFormat: true,
  interimResults: true,
  utteranceEndMs: 1000,
  vadEvents: true,
} as const
