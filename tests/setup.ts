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
  stt: {
    start: vi.fn(),
    stop: vi.fn(),
    sendAudio: vi.fn(),
    status: vi.fn(),
    onTranscript: vi.fn(),
    removeTranscriptListener: vi.fn(),
  },
}

Object.defineProperty(window, 'electron', {
  value: mockElectronAPI,
  writable: true,
})

// Mock navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn(),
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
  destination = {}
  close = vi.fn()
}

globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext
