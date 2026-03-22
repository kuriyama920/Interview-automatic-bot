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
      body: JSON.stringify({ expires_in_seconds: clampedTtl }),
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

    // 一時トークン取得失敗時はAPIキーを直接返す（JWT認証でアクセス制御済み）
    if (response.status === 403 || response.status === 404) {
      console.warn(
        `Soniox temporary API key endpoint returned ${response.status}. ` +
        'Falling back to direct API key.'
      )
      return { token: apiKey, expiresIn: clampedTtl }
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Soniox token generation failed (${response.status}): ${errorText}`)
  } catch (error) {
    // fetch 自体の失敗（ネットワークエラー等）もフォールバック
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.warn('Soniox API unreachable, falling back to direct API key')
      return { token: apiKey, expiresIn: clampedTtl }
    }
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
