import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { STTService, TranscriptResult } from '../../src/services/stt.service'

// Mock Deepgram SDK
const mockLiveClient = {
  on: vi.fn(),
  send: vi.fn(),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
}

const mockClient = {
  listen: {
    live: vi.fn(() => mockLiveClient),
  },
}

vi.mock('@deepgram/sdk', () => ({
  createClient: vi.fn(() => mockClient),
  LiveTranscriptionEvents: {
    Open: 'Open',
    Transcript: 'Transcript',
    Error: 'Error',
    Close: 'Close',
  },
}))

describe('STTService', () => {
  let sttService: STTService
  const mockApiKey = 'test-api-key'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
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
    it('should establish a connection with Deepgram', async () => {
      const onTranscript = vi.fn()

      // Simulate Open event
      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      expect(mockClient.listen.live).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'nova-2',
          language: 'ja',
          encoding: 'linear16',
          sample_rate: 16000,
        })
      )
    })

    it('should reject on connection timeout', async () => {
      const onTranscript = vi.fn()

      // Don't trigger Open event to simulate timeout
      mockLiveClient.on.mockImplementation(() => {})

      const connectPromise = sttService.connect(onTranscript)

      // Advance timers past the 10 second timeout
      vi.advanceTimersByTime(11000)

      await expect(connectPromise).rejects.toThrow('接続タイムアウト（10秒）')
    })

    it('should handle transcript events', async () => {
      const onTranscript = vi.fn()
      let transcriptCallback: (data: unknown) => void = () => {}

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Open') {
          setTimeout(() => callback(), 0)
        }
        if (event === 'Transcript') {
          transcriptCallback = callback
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      // Simulate transcript event
      const mockTranscriptData = {
        channel: {
          alternatives: [
            {
              transcript: 'Hello world',
              confidence: 0.95,
            },
          ],
        },
        is_final: true,
      }

      transcriptCallback(mockTranscriptData)

      expect(onTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: true,
          confidence: 0.95,
        })
      )
    })

    it('should handle error events with 401 error', async () => {
      const onTranscript = vi.fn()

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Error') {
          setTimeout(() => callback('401 Unauthorized'), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)

      await expect(connectPromise).rejects.toThrow('APIキーが無効です')
    })

    it('should handle error events with 403 error', async () => {
      const onTranscript = vi.fn()

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Error') {
          setTimeout(() => callback('403 Forbidden'), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)

      await expect(connectPromise).rejects.toThrow('権限がありません')
    })

    it('should handle error events with 429 error', async () => {
      const onTranscript = vi.fn()

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Error') {
          setTimeout(() => callback('429 Too Many Requests'), 0)
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

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      const audioData = Buffer.from([1, 2, 3, 4])
      sttService.send(audioData)

      expect(mockLiveClient.send).toHaveBeenCalledWith(audioData)
    })

    it('should not send audio data when not connected', () => {
      const audioData = Buffer.from([1, 2, 3, 4])
      sttService.send(audioData)

      expect(mockLiveClient.send).not.toHaveBeenCalled()
    })
  })

  describe('disconnect', () => {
    it('should disconnect and cleanup', async () => {
      const onTranscript = vi.fn()

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      await sttService.disconnect()

      expect(mockLiveClient.requestClose).toHaveBeenCalled()
      expect(sttService.isConnected()).toBe(false)
    })
  })

  describe('keepAlive', () => {
    it('should send keepalive at intervals', async () => {
      const onTranscript = vi.fn()

      mockLiveClient.on.mockImplementation((event, callback) => {
        if (event === 'Open') {
          setTimeout(() => callback(), 0)
        }
      })

      const connectPromise = sttService.connect(onTranscript)
      vi.advanceTimersByTime(100)
      await connectPromise

      // Advance time to trigger keepalive (5 seconds)
      vi.advanceTimersByTime(5000)

      expect(mockLiveClient.keepAlive).toHaveBeenCalled()
    })
  })
})
