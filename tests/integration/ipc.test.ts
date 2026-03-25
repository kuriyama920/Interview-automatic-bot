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
  dialog: {
    showOpenDialog: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}))

// Mock STTService
const mockSTTService = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  send: vi.fn(),
  isConnected: vi.fn(() => true),
  getSessionMinutes: vi.fn(() => 0),
}

vi.mock('../../src/services/stt.service', () => ({
  STTService: vi.fn().mockImplementation(() => mockSTTService),
}))

// Mock AIService - use vi.hoisted to ensure mock is available before vi.mock runs
const mockAIService = vi.hoisted(() => ({
  initialize: vi.fn(),
  generateResponse: vi.fn(),
  generateStreamResponse: vi.fn(),
  generateStreamResponseV2: vi.fn(),
  isInitialized: vi.fn(() => false),
  isV2Available: vi.fn(() => true),
  resetV2: vi.fn(),
  summarizeTurn: vi.fn(),
}))

vi.mock('../../src/services/ai.service', () => ({
  aiService: mockAIService,
}))

// Mock interviewSession (session.service)
const mockInterviewSession = vi.hoisted(() => ({
  startSession: vi.fn(),
  endSession: vi.fn(),
}))

vi.mock('../../src/services/session.service', () => ({
  interviewSession: mockInterviewSession,
}))

// Mock authService
const mockAuthService = vi.hoisted(() => ({
  addAuthStateListener: vi.fn(),
  getAuthState: vi.fn(() => ({ isAuthenticated: false })),
  startGoogleLogin: vi.fn(),
  validateAndRefresh: vi.fn(),
  logout: vi.fn(),
  getAccessToken: vi.fn(),
  authenticatedFetch: vi.fn(),
}))

vi.mock('../../src/services/auth.service', () => ({
  authService: mockAuthService,
}))

// Mock contextService
const mockContextService = vi.hoisted(() => ({
  isInitialized: vi.fn(() => false),
  initialize: vi.fn(),
  getRelevantContext: vi.fn(() => []),
  addDocument: vi.fn(),
  getDocuments: vi.fn(() => []),
  removeDocument: vi.fn(),
}))

vi.mock('../../src/services/context.service', () => ({
  contextService: mockContextService,
}))

// settingsService は削除済み（store: false 固定化）

// Mock logger.service
vi.mock('../../src/services/logger.service', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
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
    process.env = { ...originalEnv }

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
    mockSTTService.getSessionMinutes.mockReturnValue(0)

    // Reset AI mock implementations
    mockAIService.initialize.mockClear()
    mockAIService.generateResponse.mockReset()
    mockAIService.generateStreamResponse.mockReset()
    mockAIService.generateStreamResponseV2.mockReset()
    mockAIService.isInitialized.mockReturnValue(false)

    // Reset session mock implementations
    mockInterviewSession.startSession.mockClear()
    mockInterviewSession.endSession.mockClear()

    // Default authenticatedFetch mock (proxy token for STT)
    mockAuthService.authenticatedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'proxy-temp-token', expiresIn: 600 }),
    })
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
      expect(mockIpcHandlers['ai:generateStreamV2']).toBeDefined()
      expect(mockIpcHandlers['ai:isV2Available']).toBeDefined()
      expect(mockIpcHandlers['ai:resetV2']).toBeDefined()
      expect(mockIpcHandlers['ai:status']).toBeDefined()

      // Phase 7: Subscription handlers
      expect(mockIpcHandlers['subscription:getPlans']).toBeDefined()
      expect(mockIpcHandlers['subscription:checkout']).toBeDefined()
      expect(mockIpcHandlers['subscription:portal']).toBeDefined()
      expect(mockIpcHandlers['subscription:refresh']).toBeDefined()
    })
  })

  describe('stt:start handler', () => {
    it('should start STT service via proxy', async () => {
      mockAuthService.authenticatedFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'proxy-temp-token', expiresIn: 600 }),
      })
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['stt:start']()

      expect(result).toEqual({ success: true })
      expect(mockAuthService.authenticatedFetch).toHaveBeenCalled()
    })

    it('should fail when proxy returns usage limit exceeded', async () => {
      mockAuthService.authenticatedFetch.mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Usage limit exceeded' }),
      })
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['stt:start']()

      expect(result).toEqual({
        success: false,
        error: 'Usage limit exceeded',
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

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('stt:transcript', {
        ...mockTranscript,
        source: 'system',
      })
    })
  })

  describe('ai:init handler', () => {
    beforeEach(() => {
      mockAIService.isInitialized.mockReturnValue(false)
    })

    it('should initialize AI service in proxy mode', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:init'](null)

      expect(result).toEqual({ success: true })
      expect(mockAIService.initialize).toHaveBeenCalledWith({
        apiBaseUrl: expect.any(String),
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
      mockAIService.isInitialized.mockReturnValue(true)
      mockAIService.generateResponse.mockResolvedValue(mockResponse)
    })

    it('should generate AI response successfully', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generate'](null, 'Test question')

      expect(result).toEqual({ success: true, response: mockResponse })
      expect(mockAIService.generateResponse).toHaveBeenCalledWith('Test question', undefined, undefined)
    })

    it('should pass context to AI service', async () => {
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generate'](null, 'Test question', 'Test context')

      expect(mockAIService.generateResponse).toHaveBeenCalledWith('Test question', 'Test context', undefined)
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
        async (_q: string, _c: string | undefined, callbacks: { onChunk?: (chunk: string) => void }) => {
          callbacks.onChunk?.('Hello ')
          callbacks.onChunk?.('World')
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

  describe('ai:generateStreamV2 handler', () => {
    const mockResponse = {
      answer: 'V2 streaming answer',
      suggestions: ['Tip 1'],
      confidence: 0.9,
    }

    beforeEach(() => {
      mockAIService.isInitialized.mockReturnValue(true)
      mockAIService.generateStreamResponseV2.mockResolvedValue(mockResponse)
    })

    it('should generate speculative phase without previousResponseId or storeEnabled', async () => {
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', 'Some context', 'speculative', { speculativeText: 'draft' }
      )

      expect(result).toEqual({ success: true, response: mockResponse })
      expect(mockAIService.generateStreamResponseV2).toHaveBeenCalledWith(
        'Test question',
        'Some context',
        'speculative',
        expect.objectContaining({
          onChunk: expect.any(Function),
          onPhase: expect.any(Function),
        }),
        expect.any(AbortSignal),
        expect.objectContaining({
          speculativeText: 'draft',
        }),
      )
      // previousResponseId と storeEnabled は送信されない
      const passedOptions = mockAIService.generateStreamResponseV2.mock.calls[0][5]
      expect(passedOptions.previousResponseId).toBeUndefined()
      expect(passedOptions.storeEnabled).toBeUndefined()
    })

    it('should not inject previousResponseId in committed phase (store: false fixed)', async () => {
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      // previousResponseId と storeEnabled は送信されない
      const passedOptions = mockAIService.generateStreamResponseV2.mock.calls[0][5]
      expect(passedOptions.previousResponseId).toBeUndefined()
      expect(passedOptions.storeEnabled).toBeUndefined()
    })

    it('should abort previous generation and create new AbortController', async () => {
      setupIPC(mockMainWindow)

      // First call to set up an AbortController
      const firstPromise = mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question 1', undefined, 'committed', {}
      )
      await firstPromise

      // Second call should abort the first
      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question 2', undefined, 'committed', {}
      )

      // Both calls should complete; the second call's signal should be fresh (not aborted)
      const secondCallSignal = mockAIService.generateStreamResponseV2.mock.calls[1][4]
      expect(secondCallSignal.aborted).toBe(false)
    })


    it('should send ai:error event on failure', async () => {
      mockAIService.generateStreamResponseV2.mockRejectedValue(new Error('V2 Stream error'))
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(result).toEqual({
        success: false,
        error: expect.stringContaining('V2 Stream error'),
      })
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith(
        'ai:error',
        expect.stringContaining('V2 Stream error')
      )
    })

    it('should return aborted result when signal is aborted', async () => {
      mockAIService.generateStreamResponseV2.mockRejectedValue(new Error('aborted'))
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(result).toEqual({ success: false, error: 'aborted' })
      // Should NOT send ai:error for intentional aborts
      expect(mockMainWindow.webContents.send).not.toHaveBeenCalledWith(
        'ai:error',
        expect.any(String)
      )
    })

    it('should auto-initialize AI service if not initialized', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(mockAIService.initialize).toHaveBeenCalledWith({
        apiBaseUrl: expect.any(String),
      })
    })

    it('should not re-initialize if already initialized', async () => {
      mockAIService.isInitialized.mockReturnValue(true)
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(mockAIService.initialize).not.toHaveBeenCalled()
    })

    it('should forward options including includeDocumentContext and speculativeText', async () => {
      setupIPC(mockMainWindow)

      const options = {
        includeDocumentContext: true,
        speculativeText: 'draft answer',
        turnId: 'turn-123',
      }

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', 'context', 'speculative', options
      )

      const passedOptions = mockAIService.generateStreamResponseV2.mock.calls[0][5]
      expect(passedOptions.includeDocumentContext).toBe(true)
      expect(passedOptions.speculativeText).toBe('draft answer')
      expect(passedOptions.turnId).toBe('turn-123')
    })

    it('should default to committed phase when phase is not provided', async () => {
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, undefined, {}
      )

      expect(mockAIService.generateStreamResponseV2).toHaveBeenCalledWith(
        'Test question',
        undefined,
        'committed',
        expect.any(Object),
        expect.any(AbortSignal),
        expect.any(Object),
      )
    })

    it('should send ai:complete with response on success', async () => {
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:complete', mockResponse)
    })

    it('should send chunks and phase events via callbacks', async () => {
      mockAIService.generateStreamResponseV2.mockImplementation(
        async (
          _q: string,
          _c: string | undefined,
          _phase: string,
          callbacks: { onChunk?: (chunk: string) => void; onPhase?: (phase: string) => void },
        ) => {
          callbacks.onChunk?.('Hello ')
          callbacks.onChunk?.('World')
          callbacks.onPhase?.('reasoning')
          return mockResponse
        }
      )
      setupIPC(mockMainWindow)

      await mockIpcHandlers['ai:generateStreamV2'](
        null, 'Test question', undefined, 'committed', {}
      )

      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:chunk', 'Hello ')
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:chunk', 'World')
      expect(mockMainWindow.webContents.send).toHaveBeenCalledWith('ai:phase', 'reasoning')
    })
  })

  describe('ai:isV2Available handler', () => {
    it('should return v2 availability status', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      mockAIService.isV2Available.mockReturnValue(true)
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:isV2Available']()

      expect(result).toEqual({ success: true, available: true })
    })

    it('should return false when v2 is disabled', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      mockAIService.isV2Available.mockReturnValue(false)
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:isV2Available']()

      expect(result).toEqual({ success: true, available: false })
    })
  })

  describe('ai:resetV2 handler', () => {
    it('should reset v2 and return success', async () => {
      mockAIService.isInitialized.mockReturnValue(false)
      setupIPC(mockMainWindow)

      const result = await mockIpcHandlers['ai:resetV2']()

      expect(result).toEqual({ success: true })
      expect(mockAIService.resetV2).toHaveBeenCalled()
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
