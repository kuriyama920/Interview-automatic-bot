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

// 音声ソースの種類
export type AudioSource = 'mic' | 'system' | 'both'

export interface AppSettings {
  deepgramApiKey: string
  openaiApiKey: string
  theme: 'dark' | 'light'
  autoGenerateAI: boolean
  audioSource: AudioSource
  aiModel: 'gpt-5-mini' | 'gpt-5' | 'gpt-4o'
  aiTemperature: number
  aiMaxTokens: number
  contextMinSimilarity: number
  contextTopK: number
  lastUpdated: number
  version: string
}

// 認証関連の型
export type SubscriptionTier = 'free' | 'pro' | 'enterprise'
export type SubscriptionStatus = 'active' | 'canceled' | 'past_due' | 'trialing'

export interface User {
  id: string
  email: string
  name: string | null
  picture: string | null
  subscriptionTier: SubscriptionTier
  subscriptionStatus: SubscriptionStatus
  subscriptionPeriodEnd: string | null
  usage: {
    sttMinutes: number
    aiTokens: number
    storageBytes: number
  }
}

export interface UserSettings {
  theme: 'dark' | 'light'
  autoGenerateAI: boolean
  aiModel: string
  aiTemperature: number
  aiMaxTokens: number
  contextMinSimilarity: number
  contextTopK: number
  hasCustomDeepgramKey: boolean
  hasCustomOpenaiKey: boolean
}

export interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  user: User | null
  settings: UserSettings | null
  error: string | null
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
  'settings:get',
  'settings:save',
  'settings:reset',
  'settings:getEffectiveApiKey',
  // 認証関連
  'auth:getState',
  'auth:loginWithGoogle',
  'auth:validate',
  'auth:logout',
  'auth:getToken',
  // 音声キャプチャ関連 (Phase 6.5)
  'audio:setSource',
  'audio:getSource',
] as const
const ALLOWED_ON_CHANNELS = [
  'stt:transcript',
  'ai:chunk',
  'ai:complete',
  'ai:error',
  // 認証関連
  'auth:stateChanged',
] as const

type AllowedSendChannel = (typeof ALLOWED_SEND_CHANNELS)[number]
type AllowedInvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number]
type AllowedOnChannel = (typeof ALLOWED_ON_CHANNELS)[number]

let audioSendCount = 0

const electronAPI = {
  // 認証API
  auth: {
    getState: (): Promise<{ success: boolean; state?: AuthState; error?: string }> =>
      ipcRenderer.invoke('auth:getState'),
    loginWithGoogle: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('auth:loginWithGoogle'),
    validate: (): Promise<{ success: boolean; state?: AuthState; error?: string }> =>
      ipcRenderer.invoke('auth:validate'),
    logout: (): Promise<{ success: boolean; state?: AuthState; error?: string }> =>
      ipcRenderer.invoke('auth:logout'),
    getToken: (): Promise<{ success: boolean; token?: string | null; error?: string }> =>
      ipcRenderer.invoke('auth:getToken'),
    onStateChanged: (callback: (state: AuthState) => void) => {
      ipcRenderer.on('auth:stateChanged', (_event, state) => callback(state))
    },
    removeStateChangedListener: () => {
      ipcRenderer.removeAllListeners('auth:stateChanged')
    },
  },

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

  // Settings API
  settings: {
    get: (): Promise<{ success: boolean; settings?: AppSettings; error?: string }> =>
      ipcRenderer.invoke('settings:get'),
    save: (
      settings: Partial<AppSettings>
    ): Promise<{ success: boolean; settings?: AppSettings; error?: string }> =>
      ipcRenderer.invoke('settings:save', settings),
    reset: (): Promise<{ success: boolean; settings?: AppSettings; error?: string }> =>
      ipcRenderer.invoke('settings:reset'),
    getEffectiveApiKey: (
      keyType: 'deepgram' | 'openai'
    ): Promise<{ success: boolean; key?: string | null }> =>
      ipcRenderer.invoke('settings:getEffectiveApiKey', keyType),
  },

  // Audio API (Phase 6.5: システム音声キャプチャ)
  audio: {
    setSource: (
      source: AudioSource
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('audio:setSource', source),
    getSource: (): Promise<{ success: boolean; source: AudioSource; error?: string }> =>
      ipcRenderer.invoke('audio:getSource'),
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
