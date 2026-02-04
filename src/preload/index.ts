import { contextBridge, ipcRenderer } from 'electron'

export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
}

export interface AIResponse {
  answer: string
  suggestions: string[]
  confidence: number
}

export type DocumentType = 'resume' | 'job_posting'

export interface DocumentInfo {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
}

// 許可されたIPCチャンネルのホワイトリスト（セキュリティ向上）
const ALLOWED_SEND_CHANNELS = ['stt:audio'] as const
const ALLOWED_INVOKE_CHANNELS = [
  'config:getApiKey',
  'stt:start',
  'stt:stop',
  'stt:status',
  'ai:init',
  'ai:generate',
  'ai:generateStream',
  'ai:status',
  'context:init',
  'document:upload',
  'document:list',
  'document:remove',
] as const
const ALLOWED_ON_CHANNELS = ['stt:transcript', 'ai:chunk', 'ai:complete', 'ai:error'] as const

type AllowedSendChannel = (typeof ALLOWED_SEND_CHANNELS)[number]
type AllowedInvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number]
type AllowedOnChannel = (typeof ALLOWED_ON_CHANNELS)[number]

let audioSendCount = 0

const electronAPI = {
  // 設定API
  config: {
    getApiKey: (keyName: string): Promise<string | null> =>
      ipcRenderer.invoke('config:getApiKey', keyName),
  },

  // STT (音声認識) API
  stt: {
    // APIキーはMain processで環境変数から直接取得（セキュリティ向上）
    start: () => ipcRenderer.invoke('stt:start'),
    stop: () => {
      audioSendCount = 0 // カウンターをリセット
      return ipcRenderer.invoke('stt:stop')
    },
    sendAudio: (audioData: ArrayBuffer) => {
      // ArrayBufferをUint8Arrayに変換してからIPC送信
      const uint8Array = new Uint8Array(audioData)
      audioSendCount++
      ipcRenderer.send('stt:audio', Array.from(uint8Array))
    },
    status: () => ipcRenderer.invoke('stt:status'),
    onTranscript: (callback: (result: TranscriptResult) => void) => {
      ipcRenderer.on('stt:transcript', (_event, result) => callback(result))
    },
    removeTranscriptListener: () => {
      ipcRenderer.removeAllListeners('stt:transcript')
    },
  },

  // AI API
  ai: {
    init: (apiKey?: string) => ipcRenderer.invoke('ai:init', apiKey),
    generate: (question: string, context?: string) =>
      ipcRenderer.invoke('ai:generate', question, context),
    generateStream: (question: string, context?: string) =>
      ipcRenderer.invoke('ai:generateStream', question, context),
    status: () => ipcRenderer.invoke('ai:status'),
    onChunk: (callback: (chunk: string) => void) => {
      ipcRenderer.on('ai:chunk', (_event, chunk) => callback(chunk))
    },
    onComplete: (callback: (response: AIResponse) => void) => {
      ipcRenderer.on('ai:complete', (_event, response) => callback(response))
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('ai:error', (_event, error) => callback(error))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('ai:chunk')
      ipcRenderer.removeAllListeners('ai:complete')
      ipcRenderer.removeAllListeners('ai:error')
    },
  },

  // Document API
  document: {
    init: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('context:init'),
    upload: (
      type: DocumentType
    ): Promise<{
      success: boolean
      error?: string
      document?: DocumentInfo & { wordCount: number }
    }> => ipcRenderer.invoke('document:upload', type),
    list: (): Promise<{ success: boolean; documents: DocumentInfo[] }> =>
      ipcRenderer.invoke('document:list'),
    remove: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('document:remove', id),
  },

  // 汎用IPC（ホワイトリスト制限付き - セキュリティ向上）
  send: (channel: string, data: unknown) => {
    if (ALLOWED_SEND_CHANNELS.includes(channel as AllowedSendChannel)) {
      ipcRenderer.send(channel, data)
    }
  },
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    if (ALLOWED_ON_CHANNELS.includes(channel as AllowedOnChannel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    }
  },
  invoke: (channel: string, data?: unknown) => {
    if (ALLOWED_INVOKE_CHANNELS.includes(channel as AllowedInvokeChannel)) {
      return ipcRenderer.invoke(channel, data)
    }
    return Promise.reject(new Error(`Channel "${channel}" is not allowed`))
  },
  removeAllListeners: (channel: string) => {
    if (ALLOWED_ON_CHANNELS.includes(channel as AllowedOnChannel)) {
      ipcRenderer.removeAllListeners(channel)
    }
  },
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
