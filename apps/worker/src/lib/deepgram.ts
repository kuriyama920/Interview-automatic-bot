/**
 * Deepgram クライアント
 * 一時トークン発行のみ。音声処理はクライアントが直接 Deepgram に接続。
 */

interface DeepgramTokenResult {
  token: string
  expiresIn: number
}

/**
 * Deepgram の認証トークンを取得
 *
 * 1. まず /v1/auth/grant で短命の一時トークン発行を試みる（Member以上の権限が必要）
 * 2. 権限不足（403）の場合は API キーを直接返す（JWT 認証でアクセス制御済み）
 */
export async function generateTemporaryToken(
  apiKey: string,
  ttlSeconds: number = 600
): Promise<DeepgramTokenResult> {
  const clampedTtl = Math.min(ttlSeconds, 3600)

  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: clampedTtl }),
    })

    if (response.ok) {
      const data = (await response.json()) as { access_token: string }
      if (data.access_token) {
        return {
          token: data.access_token,
          expiresIn: clampedTtl,
        }
      }
    }

    // 403: APIキーの権限が Member 未満 → フォールバック
    if (response.status === 403) {
      console.warn(
        'Deepgram /v1/auth/grant returned 403 (insufficient permissions). ' +
        'Falling back to direct API key.'
      )
      return { token: apiKey, expiresIn: clampedTtl }
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Deepgram token generation failed (${response.status}): ${errorText}`)
  } catch (error) {
    // fetch 自体の失敗（ネットワークエラー等）もフォールバック
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.warn('Deepgram API unreachable, falling back to direct API key')
      return { token: apiKey, expiresIn: clampedTtl }
    }
    throw error
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
