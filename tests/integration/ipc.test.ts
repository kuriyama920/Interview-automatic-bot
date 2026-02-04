import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setupIPC } from '../../src/main/ipc'
import type { BrowserWindow } from 'electron'

// Mock Electron's ipcMain
const mockIpcHandlers: Record<string, (...args: unknown[]) => unknown> = {}
const mockIpcListeners: Record<string, (...args: unknown[]) => void> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      mockIpcHandlers[channel] = handler
    }),
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      mockIpcListeners[channel] = listener
    }),
  },
}))

// Mock STTService
const mockSTTService = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  isConnected: vi.fn(() => true),
}

vi.mock('../../src/services/stt.service', () => ({
  STTService: vi.fn().mockImplementation(() => mockSTTService),
}))

// Mock AIService - use vi.hoisted to ensure mock is available before vi.mock runs
const mockAIService = vi.hoisted(() => ({
  initialize: vi.fn(),
  generateResponse: vi.fn(),
  generateStreamResponse: vi.fn(),
  isInitialized: vi.fn(() => false),
  updateConfig: vi.fn(),
}))

vi.mock('../../src/services/ai.service', () => ({
  aiService: mockAIService,
}))

describe('IPC Handlers', () => {
  let mockMainWindow: BrowserWindow
  const originalEnv = process.env

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset handler maps
    Object.keys(mockIpcHandlers).forEach((key) => delete mockIpcHandlers[key])
    Object.keys(mockIpcListeners).forEach((key) => delete mockIpcListeners[key])

    // Mock environment variable
    process.env = { ...originalEnv, DEEPGRAM_API_KEY: 'test-api-key' }

    // Create mock BrowserWindow
    mockMainWindow = {
      webContents: {
        send: vi.fn(),
      },
    } as unknown as BrowserWindow

    // Reset mock implementations
    mockSTTService.connect.mockResolvedValue(undefined)
    mockSTTService.disconnect.mockResolvedValue(undefined)
    mockSTTService.isConnected.mockReturnValue(true)

    // Reset AI mock implementations
    mockAIService.initialize.mockClear()
    mockAIService.generateResponse.mockReset()
    mockAIService.generateStreamResponse.mockReset()
    mockAIService.isInitialized.mockReturnValue(false)
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('setupIPC', () => {
    it('should register all IPC handlers', () => {
      setupIPC(mockMainWindow)

      // STT handlers
      expect(mockIpcHandlers['stt:start']).toBeDefined()
      expect(mockIpcHandlers['stt:stop']).toBeDefined()
      expect(mockIpcHandlers['stt:status']).toBeDefined()
      expect(mockIpcListeners['stt:audio']).toBeDefined()

      // AI handlers
      expect(mockIpcHandlers['ai:init']).toBeDefined()
      expect(mockIpcHandlers['ai:generate']).toBeDefined()
      expect(mockIpcHandlers['ai:generateStream']).toBeDefined()
      expect(mockIpcHandlers['ai:status']).toBeDefined()
    })
  })

  describe('stt:start handler', () => {
    it('should start STT service successfully', async () => {
      setupIPC(mockMainWindow)

      // stt:start no longer takes apiKey - gets it from environment
      const result = await mockIpcHandlers['stt:start']()

      expect(result).toEqual({ success: true })
    })

    it('should fail when DEEPGRAM_API_KEY is not configured', async () => {
      delete process.env.DEEPGRAM_API_KEY
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['stt:start']()

      expect(result).toEqual({
        success: false,
        error: 'DEEPGRAM_API_KEY not configured in environment',
      })
    })

    it('should handle STT start error', async () => {
      mockSTTService.connect.mockRejectedValue(new Error('Connection failed'))
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['stt:start']()

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('Connection failed'),
      })
    })

    it('should disconnect existing service before starting new one', async () => {
      setupIPC(mockMainWindow)

      // Start first
      await mockIpcHandlers['stt:start']()

      // Start again (should disconnect first)
      await mockIpcHandlers['stt:start']()

      expect(mockSTTService.disconnect).toHaveBeenCalled()
    })
  })

  describe('stt:stop handler', () => {
    it('should stop STT service successfully', async () => {
      setupIPC(mockMainWindow)

      // Start first
      await mockIpcHandlers['stt:start']()

      // Then stop
      const result = await mockIpcHandlers['stt:stop']()

      expect(result).toEqual({ success: true })
      expect(mockSTTService.disconnect).toHaveBeenCalled()
    })

    it('should handle stop when no service exists', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['stt:stop']()

      expect(result).toEqual({ success: true })
    })
  })

  describe('stt:audio listener', () => {
    it('should forward audio data to STT service', async () => {
      setupIPC(mockMainWindow)

      // Start service first
      await mockIpcHandlers['stt:start']()

      // Send audio data (as number[] from preload)
      const audioData = Array.from(new Uint8Array(1024))
      mockIpcListeners['stt:audio'](null, audioData)

      expect(mockSTTService.send).toHaveBeenCalledWith(expect.any(Buffer))
    })

    it('should not send audio when STT is not connected', async () => {
      mockSTTService.isConnected.mockReturnValue(false)
      setupIPC(mockMainWindow)

      // Start service (but mock says not connected)
      await mockIpcHandlers['stt:start']()

      // Send audio data
      const audioData = Array.from(new Uint8Array(1024))
      mockIpcListeners['stt:audio'](null, audioData)

      expect(mockSTTService.send).not.toHaveBeenCalled()
    })
  })

  describe('stt:status handler', () => {
    it('should return connected status', async () => {
      setupIPC(mockMainWindow)

      // Start service
      await mockIpcHandlers['stt:start']()

      const result = mockIpcHandlers['stt:status']()

      expect(result).toEqual({ connected: true })
    })

    it('should return disconnected status when no service', async () => {
      mockSTTService.isConnected.mockReturnValue(false)
      setupIPC(mockMainWindow)

      // Ensure service is stopped
      await mockIpcHandlers['stt:stop']()

      const result = mockIpcHandlers['stt:status']()

      expect(result).toEqual({ connected: false })
    })
  })

  describe('transcript forwarding', () => {
    it('should forward transcript to renderer', async () => {
      setupIPC(mockMainWindow)

      // Capture the callback passed to STTService.connect
      let transcriptCallback: ((result: unknown) => void) | null = null
      mockSTTService.connect.mockImplementation(async (callback: (result: unknown) => void) => {
        transcriptCallback = callback
      })

      // Start service
      await mockIpcHandlers['stt:start']()

      // Simulate receiving a transcript
      const mockTranscript = {
        text: 'Hello world',
        isFinal: true,
        confidence: 0.95,
        timestamp: Date.now(),
      }

      if (transcriptCallback) {
        transcriptCallback(mockTranscript)
      }

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('stt:transcript', mockTranscript)
    })
  })

  describe('ai:init handler', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-openai-key'
      mockAIService.isInitialized.mockReturnValue(false)
    })

    it('should initialize AI service with environment API key', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:init'](null)

      expect(result).toEqual({ success: true })
      expect(mockAIService.initialize).toHaveBeenCalledWith({ apiKey: 'test-openai-key' })
    })

    it('should use provided API key over environment', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:init'](null, 'custom-api-key')

      expect(result).toEqual({ success: true })
      expect(mockAIService.initialize).toHaveBeenCalledWith({ apiKey: 'custom-api-key' })
    })

    it('should fail when no API key available', async () => {
      delete process.env.OPENAI_API_KEY
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:init'](null)

      expect(result).toEqual({
        success: false,
        error: 'OpenAI API key not found',
      })
    })
  })

  describe('ai:generate handler', () => {
    const mockResponse = {
      answer: 'Test answer',
      suggestions: ['Suggestion 1', 'Suggestion 2'],
      confidence: 0.85,
    }

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-openai-key'
      mockAIService.isInitialized.mockReturnValue(true)
      mockAIService.generateResponse.mockResolvedValue(mockResponse)
    })

    it('should generate AI response successfully', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generate'](null, 'Test question')

      expect(result).toEqual({ success: true, response: mockResponse })
      expect(mockAIService.generateResponse).toHaveBeenCalledWith('Test question', undefined)
    })

    it('should pass context to AI service', async () => {
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generate'](null, 'Test question', 'Test context')

      expect(mockAIService.generateResponse).toHaveBeenCalledWith('Test question', 'Test context')
    })

    it('should auto-initialize if not initialized', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generate'](null, 'Test question')

      expect(mockAIService.initialize).toHaveBeenCalled()
    })

    it('should fail when AI service throws error', async () => {
      mockAIService.generateResponse.mockRejectedValue(new Error('API error'))
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generate'](null, 'Test question')

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('API error'),
      })
    })
  })

  describe('ai:generateStream handler', () => {
    const mockResponse = {
      answer: 'Streaming answer',
      suggestions: ['Tip 1'],
      confidence: 0.85,
    }

    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'test-openai-key'
      mockAIService.isInitialized.mockReturnValue(true)
      mockAIService.generateStreamResponse.mockResolvedValue(mockResponse)
    })

    it('should generate streaming response successfully', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generateStream'](null, 'Test question')

      expect(result).toEqual({ success: true, response: mockResponse })
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:complete', mockResponse)
    })

    it('should send chunks via callback', async () => {
      mockAIService.generateStreamResponse.mockImplementation(
        async (_q: string, _c: string | undefined, onChunk: (chunk: string) => void) => {
          onChunk('Hello ')
          onChunk('World')
          return mockResponse
        }
      )
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStream'](null, 'Test question')

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:chunk', 'Hello ')
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:chunk', 'World')
    })

    it('should send error event on failure', async () => {
      mockAIService.generateStreamResponse.mockRejectedValue(new Error('Stream error'))
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStream'](null, 'Test question')

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:error', expect.stringContaining('Stream error'))
    })
  })

  describe('ai:status handler', () => {
    it('should return initialized status', async () => {
      mockAIService.isInitialized.mockReturnValue(true)
      setupIPC(mockMainWindow)

      const result = mockIpcHandlers['ai:status']()

      expect(result).toEqual({ initialized: true })
    })

    it('should return not initialized status', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      setupIPC(mockMainWindow)

      const result = mockIpcHandlers['ai:status']()

      expect(result).toEqual({ initialized: false })
    })
  })
})
