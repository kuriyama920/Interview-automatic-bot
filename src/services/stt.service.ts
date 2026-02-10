import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk'
import type { LiveClient } from '@deepgram/sdk'
import { createLogger } from './logger.service'

const log = createLogger('STT')

export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
}

type TranscriptCallback = (result: TranscriptResult) => void

const KEEPALIVE_INTERVAL_MS = 5000 // 5秒ごとにキープアライブを送信

export class STTService {
  private client: ReturnType<typeof createClient> | null = null
  private connection: LiveClient | null = null
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
    this.client = createClient(this.apiKey)

    log.info('Creating live connection...')

    return new Promise((resolve, reject) => {
      this.connection = this.client!.listen.live({
        model: 'nova-2',
        language: 'ja',
        smart_format: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1,
      })

      const timeout = setTimeout(() => {
        // タイムアウト時のクリーンアップ
        if (this.connection) {
          this.connection.requestClose()
          this.connection = null
        }
        this._isConnected = false
        this.client = null
        reject(new Error('接続タイムアウト（10秒）'))
      }, 10000)

      this.connection.on(LiveTranscriptionEvents.Open, () => {
        log.info('Deepgram connection opened')
        this._isConnected = true
        clearTimeout(timeout)
        this.startKeepAlive()
        resolve()
      })

      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript
        const confidence = data.channel?.alternatives?.[0]?.confidence ?? 0

        if (transcript && this.onTranscript) {
          if (data.is_final) {
            log.debug('Final transcript', { length: transcript.length, confidence })
          }
          this.onTranscript({
            text: transcript,
            isFinal: data.is_final ?? false,
            confidence,
            timestamp: Date.now(),
          })
        }
      })

      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        log.error('Connection error', { error: String(error) })
        this._isConnected = false
        this.stopKeepAlive()
        clearTimeout(timeout)

        const errorMessage = this.parseError(error)
        reject(new Error(errorMessage))
      })

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        log.info('Connection closed')
        this._isConnected = false
        this.stopKeepAlive()
      })
    })
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    log.debug('Starting keepalive')
    this.keepAliveInterval = setInterval(() => {
      if (this.connection && this._isConnected) {
        try {
          this.connection.keepAlive()
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

  private parseError(error: unknown): string {
    const errorStr = String(error)

    if (errorStr.includes('401')) {
      return 'APIキーが無効です。Deepgramダッシュボードで有効なキーを確認してください。'
    }
    if (errorStr.includes('403')) {
      return 'このAPIキーにはLive Transcription権限がありません。'
    }
    if (errorStr.includes('429')) {
      return 'レート制限に達しました。しばらく待ってから再試行してください。'
    }
    if (errorStr.includes('ENOTFOUND') || errorStr.includes('ECONNREFUSED')) {
      return 'ネットワーク接続エラー。インターネット接続を確認してください。'
    }

    return `接続エラー: ${errorStr.substring(0, 100)}`
  }

  send(audioData: Buffer): void {
    if (this.connection && this._isConnected) {
      try {
        this.connection.send(audioData)
      } catch (err) {
        log.error('Failed to send audio data', { error: String(err) })
      }
    }
  }

  async disconnect(): Promise<void> {
    log.info('Disconnecting...')
    this.stopKeepAlive()
    if (this.connection) {
      this.connection.requestClose()
      this.connection = null
    }
    this._isConnected = false
    this.client = null
  }

  isConnected(): boolean {
    return this._isConnected
  }
}
