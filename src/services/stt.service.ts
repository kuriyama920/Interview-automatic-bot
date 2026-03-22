import WebSocket from 'ws'
import { createLogger } from './logger.service'

const log = createLogger('STT')

export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
  source?: 'mic' | 'system'
}

type TranscriptCallback = (result: TranscriptResult) => void

const KEEPALIVE_INTERVAL_MS = 15000 // 15秒ごと（Soniox: 20秒制限に余裕を持たせる）
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket'

interface SonioxToken {
  text: string
  start_ms: number
  end_ms: number
  confidence: number
  is_final: boolean
}

interface SonioxResponse {
  tokens: SonioxToken[]
  final_audio_proc_ms: number
  total_audio_proc_ms: number
  error_code?: number
  error_message?: string
}

export class STTService {
  private ws: WebSocket | null = null
  private apiKey: string
  private onTranscript: TranscriptCallback | null = null
  private _isConnected = false
  private keepAliveInterval: NodeJS.Timeout | null = null
  private sessionStartTime: number | null = null

  constructor(apiKey: string) {
    this.apiKey = apiKey
    log.debug('Service created')
  }

  /**
   * セッション開始からの経過時間（分、切り上げ）
   */
  getSessionMinutes(): number {
    if (!this.sessionStartTime) return 0
    return Math.ceil((Date.now() - this.sessionStartTime) / 60000)
  }

  async connect(onTranscript: TranscriptCallback): Promise<void> {
    this.onTranscript = onTranscript
    this.sessionStartTime = Date.now()

    log.info('Creating Soniox WebSocket connection...')

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(SONIOX_WS_URL)

      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.close()
          this.ws = null
        }
        this._isConnected = false
        reject(new Error('接続タイムアウト（10秒）'))
      }, 10000)

      this.ws.on('open', () => {
        log.info('Soniox WebSocket opened, sending config...')

        const config = {
          api_key: this.apiKey,
          model: 'stt-rt-preview',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          num_channels: 1,
          language_hints: ['ja'],
          enable_endpoint_detection: true,
        }

        this.ws!.send(JSON.stringify(config))
        this._isConnected = true
        clearTimeout(timeout)
        this.startKeepAlive()
        resolve()
      })

      this.ws.on('message', (data) => {
        try {
          const response: SonioxResponse = JSON.parse(data.toString())

          if (response.error_code) {
            log.error('Soniox API error', {
              code: response.error_code,
              message: response.error_message,
            })
            const errorMessage = this.parseError(response.error_code, response.error_message)
            this._isConnected = false
            this.stopKeepAlive()
            reject(new Error(errorMessage))
            return
          }

          if (response.tokens && response.tokens.length > 0) {
            const finalTokens = response.tokens.filter((t) => t.is_final)
            const interimTokens = response.tokens.filter((t) => !t.is_final)

            // Final tokens → confirmed transcript
            if (finalTokens.length > 0) {
              const text = finalTokens.map((t) => t.text).join('')
              const avgConfidence =
                finalTokens.reduce((sum, t) => sum + t.confidence, 0) / finalTokens.length

              if (text.trim() && this.onTranscript) {
                log.debug('Final transcript', { length: text.length, confidence: avgConfidence })
                this.onTranscript({
                  text: text.trim(),
                  isFinal: true,
                  confidence: avgConfidence,
                  timestamp: Date.now(),
                })
              }
            }

            // Interim tokens → partial result
            if (interimTokens.length > 0) {
              const text = interimTokens.map((t) => t.text).join('')
              const avgConfidence =
                interimTokens.reduce((sum, t) => sum + t.confidence, 0) / interimTokens.length

              if (text.trim() && this.onTranscript) {
                this.onTranscript({
                  text: text.trim(),
                  isFinal: false,
                  confidence: avgConfidence,
                  timestamp: Date.now(),
                })
              }
            }
          }
        } catch (err) {
          log.error('Failed to parse Soniox response', { error: String(err) })
        }
      })

      this.ws.on('error', (error) => {
        log.error('WebSocket error', { error: String(error) })
        this._isConnected = false
        this.stopKeepAlive()
        clearTimeout(timeout)
        reject(new Error(this.parseError(0, String(error))))
      })

      this.ws.on('close', (code, reason) => {
        log.info('WebSocket closed', { code, reason: reason?.toString() })
        this._isConnected = false
        this.stopKeepAlive()
      })
    })
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    log.debug('Starting keepalive (15s interval)')
    this.keepAliveInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'keepalive' }))
          log.debug('Keepalive sent')
        } catch (err) {
          log.error('Keepalive error', { error: String(err) })
        }
      }
    }, KEEPALIVE_INTERVAL_MS)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      log.debug('Stopping keepalive')
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  private parseError(code: number, message?: string): string {
    const errorStr = message || ''

    log.error('Soniox error details', { code, errorStr })

    if (code === 401 || errorStr.includes('401')) {
      return 'APIキーが無効です。Sonioxダッシュボードで有効なキーを確認してください。'
    }
    if (code === 402 || errorStr.includes('402')) {
      return '残高不足です。Sonioxダッシュボードで残高を追加してください。'
    }
    if (code === 403 || errorStr.includes('403')) {
      return 'このAPIキーには音声認識の権限がありません。'
    }
    if (code === 429 || errorStr.includes('429')) {
      return 'レート制限に達しました。しばらく待ってから再試行してください。'
    }
    if (errorStr.includes('ENOTFOUND') || errorStr.includes('ECONNREFUSED')) {
      return 'ネットワーク接続エラー。インターネット接続を確認してください。'
    }

    return `接続エラー: ${errorStr.substring(0, 150)}`
  }

  send(audioData: Buffer): void {
    if (this.ws && this._isConnected && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(audioData)
      } catch (err) {
        log.error('Failed to send audio data', { error: String(err) })
      }
    }
  }

  async disconnect(): Promise<void> {
    log.info('Disconnecting...')
    this.stopKeepAlive()
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        // Soniox: 空フレーム送信でグレースフル切断
        this.ws.send(Buffer.alloc(0))
      }
      this.ws.close()
      this.ws = null
    }
    this._isConnected = false
  }

  isConnected(): boolean {
    return this._isConnected
  }
}
