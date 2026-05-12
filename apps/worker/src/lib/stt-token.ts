/**
 * Soniox STT クライアント
 * 一時APIキー発行。音声処理はクライアントが直接 Soniox WebSocket に接続。
 */

interface SonioxTokenResult {
  token: string
  expiresIn: number
}

/**
 * Soniox の一時APIキーを取得
 *
 * POST https://api.soniox.com/v1/auth/temporary-api-key で短命トークンを発行
 */
export async function generateTemporaryToken(
  apiKey: string,
  ttlSeconds: number = 600
): Promise<SonioxTokenResult> {
  const clampedTtl = Math.min(ttlSeconds, 3600)

  try {
    const response = await fetch('https://api.soniox.com/v1/auth/temporary-api-key', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: clampedTtl,
      }),
    })

    if (response.ok) {
      const data = (await response.json()) as { api_key: string; expires_at: string }
      if (data.api_key) {
        return {
          token: data.api_key,
          expiresIn: clampedTtl,
        }
      }
    }

    if (response.status === 403 || response.status === 404) {
      throw new Error(
        `Soniox temporary token endpoint unavailable (${response.status}). ` +
        'Check API key permissions or endpoint availability.'
      )
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Soniox token generation failed (${response.status}): ${errorText}`)
  } catch (error) {
    throw error
  }
}

/**
 * デフォルトの STT 設定（Soniox stt-rt-preview）
 */
export const DEFAULT_STT_CONFIG = {
  model: 'stt-rt-preview',
  audioFormat: 'pcm_s16le',
  sampleRate: 16000,
  numChannels: 1,
  languageHints: ['ja'],
  enableEndpointDetection: true,
} as const
