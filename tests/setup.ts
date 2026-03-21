import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock winston for main process tests
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  add: vi.fn(),
}

vi.mock('winston', () => {
  const mockFormat = {
    combine: vi.fn(() => mockFormat),
    timestamp: vi.fn(() => mockFormat),
    printf: vi.fn(() => mockFormat),
    colorize: vi.fn(() => mockFormat),
  }

  return {
    default: {
      createLogger: vi.fn(() => mockLogger),
      format: mockFormat,
      transports: {
        Console: vi.fn(),
        File: vi.fn(),
      },
    },
    createLogger: vi.fn(() => mockLogger),
    format: mockFormat,
    transports: {
      Console: vi.fn(),
      File: vi.fn(),
    },
  }
})

// Mock Electron APIs
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp'),
  },
}))

// Mock window.electron for renderer tests
const mockElectronAPI = {
  auth: {
    getState: vi.fn().mockResolvedValue({ success: true, state: { isAuthenticated: false, isLoading: false, user: null, error: null } }),
    loginWithGoogle: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ success: true, state: { isAuthenticated: false, isLoading: false, user: null, error: null } }),
    logout: vi.fn().mockResolvedValue({ success: true }),
    getToken: vi.fn().mockResolvedValue({ success: true, token: null }),
    onStateChanged: vi.fn().mockReturnValue(vi.fn()),
  },
  stt: {
    start: vi.fn(),
    stop: vi.fn(),
    sendAudio: vi.fn(),
    status: vi.fn(),
    onTranscript: vi.fn(),
    removeTranscriptListener: vi.fn(),
  },
  ai: {
    init: vi.fn().mockResolvedValue({ success: true }),
    generate: vi.fn().mockResolvedValue({ success: true, response: { answer: '', suggestions: [], confidence: 0 } }),
    generateStream: vi.fn().mockResolvedValue({ success: true }),
    generateStreamV2: vi.fn().mockResolvedValue({ success: true }),
    summarize: vi.fn().mockResolvedValue({ success: true, summary: '' }),
    prefetchContext: vi.fn().mockResolvedValue({ success: true, context: '' }),
    abort: vi.fn().mockResolvedValue(undefined),
    warm: vi.fn().mockResolvedValue({ success: true }),
    status: vi.fn().mockResolvedValue({ initialized: false }),
    isV2Available: vi.fn().mockResolvedValue({ success: true, available: true }),
    resetV2: vi.fn().mockResolvedValue({ success: true }),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onPhase: vi.fn(),
    removeListeners: vi.fn(),
  },
  document: {
    init: vi.fn().mockResolvedValue({ success: true }),
    upload: vi.fn().mockResolvedValue({ success: true }),
    list: vi.fn().mockResolvedValue({ success: true, documents: [] }),
    remove: vi.fn().mockResolvedValue({ success: true }),
  },
  audio: {
    getSource: vi.fn().mockResolvedValue({ success: true, source: 'mic' }),
    setSource: vi.fn().mockResolvedValue({ success: true }),
  },
  questions: {
    list: vi.fn().mockResolvedValue({ success: true, questions: [] }),
    save: vi.fn().mockResolvedValue({ success: true, questions: [] }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    generate: vi.fn().mockResolvedValue({ success: true, questions: [] }),
  },
  window: {
    minimize: vi.fn().mockResolvedValue(undefined),
    maximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isMaximized: vi.fn().mockResolvedValue(false),
  },
  profile: {
    get: vi.fn().mockResolvedValue({ success: true, profile: null }),
    save: vi.fn().mockResolvedValue({ success: true }),
  },
  subscription: {
    getPlans: vi.fn().mockResolvedValue({ success: true, data: null }),
    checkout: vi.fn().mockResolvedValue({ success: true }),
    portal: vi.fn().mockResolvedValue({ success: true }),
    refresh: vi.fn().mockResolvedValue({ success: true, data: null }),
  },
  send: vi.fn(),
  on: vi.fn(),
  invoke: vi.fn(),
  removeAllListeners: vi.fn(),
}

Object.defineProperty(window, 'electron', {
  value: mockElectronAPI,
  writable: true,
})

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(),
    getDisplayMedia: vi.fn(),
  },
  writable: true,
})

// Mock AudioContext
class MockAudioContext {
  sampleRate = 48000
  createMediaStreamSource = vi.fn(() => ({
    connect: vi.fn(),
  }))
  createScriptProcessor = vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    onaudioprocess: null,
  }))
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  }
  destination = {}
  close = vi.fn().mockResolvedValue(undefined)
}

globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext

// Mock AudioWorkletNode
class MockAudioWorkletNode {
  connect = vi.fn()
  disconnect = vi.fn()
  port = {
    onmessage: null as ((e: MessageEvent) => void) | null,
    postMessage: vi.fn(),
  }
  constructor() {}
}

globalThis.AudioWorkletNode = MockAudioWorkletNode as unknown as typeof AudioWorkletNode
