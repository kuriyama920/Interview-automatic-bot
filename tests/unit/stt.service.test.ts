import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { STTService, TranscriptResult } from '../../src/services/stt.service'

// Mock ws module
const mockWsSend = vi.fn()
const mockWsClose = vi.fn()
const mockWsOn = vi.fn()

let mockWsReadyState = 1 // WebSocket.OPEN

const mockWsInstance = {
  send: mockWsSend,
  close: mockWsClose,
  on: mockWsOn,
  get readyState() {
    return mockWsReadyState
  },
}

vi.mock('ws', () => {
  const MockWebSocket = vi.fn(() => mockWsInstance)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(MockWebSocket as any).OPEN = 1
  return { default: MockWebSocket }
})

describe('STTService', () => {
  let sttService: STTService
  const mockApiKey = 'test-api-key'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    mockWsReadyState = 1
    sttService = new STTService(mockApiKey)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('constructor', () => {
    it('should create a new instance with the provided API key', () => {
      expect(sttService).toBeInstanceOf(STTService)
      expect(sttService.isConnected()).toBe(false)
    })
  })

  describe('connect', () => {
    it('should establish a connection with Soniox WebSocket', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      // Verify config message was sent
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"model":"stt-rt-preview"')
      )
      expect(mockWsSend).toHaveBeenCalledWith(
        expect.stringContaining('"audio_format":"pcm_s16le"')
      )
    })

    it('should reject on connection timeout', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation(() => {})

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(11000)

      await expect(connectPromise).rejects.toThrow('接続タイムアウト（10秒）')
    })

    it('should handle Soniox transcript events with final tokens', async () => {
      const onTranscript = vi.fn()
      let messageCallback: (data: Buffer) => void = () => {}

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
        if (event === 'message') {
          messageCallback = callback as (data: Buffer) => void
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      // Simulate Soniox response with final tokens
      const sonioxResponse = {
        tokens: [
          { text: 'こんにちは', start_ms: 0, end_ms: 500, confidence: 0.95, is_final: true },
          { text: '世界', start_ms: 500, end_ms: 800, confidence: 0.92, is_final: true },
        ],
        final_audio_proc_ms: 800,
        total_audio_proc_ms: 900,
      }

      messageCallback(Buffer.from(JSON.stringify(sonioxResponse)))

      expect(onTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'こんにちは世界',
          isFinal: true,
          confidence: expect.closeTo(0.935, 2),
        })
      )
    })

    it('should handle interim tokens', async () => {
      const onTranscript = vi.fn()
      let messageCallback: (data: Buffer) => void = () => {}

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
        if (event === 'message') {
          messageCallback = callback as (data: Buffer) => void
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      const sonioxResponse = {
        tokens: [
          { text: 'こんに', start_ms: 0, end_ms: 300, confidence: 0.80, is_final: false },
        ],
        final_audio_proc_ms: 0,
        total_audio_proc_ms: 300,
      }

      messageCallback(Buffer.from(JSON.stringify(sonioxResponse)))

      expect(onTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'こんに',
          isFinal: false,
        })
      )
    })

    it('should handle Soniox API error (401) before open', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'message') {
          // Error response arrives before open (or instead of open)
          setTimeout(() => {
            callback(Buffer.from(JSON.stringify({
              tokens: [],
              final_audio_proc_ms: 0,
              total_audio_proc_ms: 0,
              error_code: 401,
              error_message: 'Unauthorized',
            })))
          }, 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)

      await expect(connectPromise).rejects.toThrow('APIキーが無効です')
    })

    it('should handle Soniox API error (402 balance) before open', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'message') {
          setTimeout(() => {
            callback(Buffer.from(JSON.stringify({
              tokens: [],
              final_audio_proc_ms: 0,
              total_audio_proc_ms: 0,
              error_code: 402,
              error_message: 'Organization balance exhausted',
            })))
          }, 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)

      await expect(connectPromise).rejects.toThrow('残高不足')
    })

    it('should handle rate limit error (429) before open', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'message') {
          setTimeout(() => {
            callback(Buffer.from(JSON.stringify({
              tokens: [],
              final_audio_proc_ms: 0,
              total_audio_proc_ms: 0,
              error_code: 429,
              error_message: 'Too Many Requests',
            })))
          }, 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)

      await expect(connectPromise).rejects.toThrow('レート制限')
    })
  })

  describe('send', () => {
    it('should send audio data when connected', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      mockWsSend.mockClear()
      const audioData = Buffer.from([1, 2, 3, 4])
      sttService.send(audioData)

      expect(mockWsSend).toHaveBeenCalledWith(audioData)
    })

    it('should not send audio data when not connected', () => {
      const audioData = Buffer.from([1, 2, 3, 4])
      sttService.send(audioData)

      expect(mockWsSend).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should disconnect and cleanup', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      mockWsSend.mockClear()
      await sttService.disconnect()

      // Should send empty buffer for graceful disconnect
      expect(mockWsSend).toHaveBeenCalledWith(Buffer.alloc(0))
      expect(mockWsClose).toHaveBeenCalled()
      expect(sttService.isConnected()).toBe(false)
    })
  })

  describe('keepAlive', () => {
    it('should send keepalive at intervals (15s)', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      mockWsSend.mockClear()

      // Advance time to trigger keepalive (15 seconds)
      vi.advanceTimersByTime(15000)

      expect(mockWsSend).toHaveBeenCalledWith(
        JSON.stringify({ type: 'keepalive' })
      )
    })
  })

  describe('getSessionMinutes', () => {
    it('should return 0 before connection', () => {
      expect(sttService.getSessionMinutes()).toBe(0)
    })

    it('should return elapsed minutes after connection', async () => {
      const onTranscript = vi.fn()

      mockWsOn.mockImplementation((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      // Advance 2.5 minutes
      vi.advanceTimersByTime(150000)

      expect(sttService.getSessionMinutes()).toBe(3) // ceil(2.5)
    })
  })
})
