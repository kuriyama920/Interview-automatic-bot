import { contextBridge, ipcRenderer } from 'electron'
import type {
  TranscriptResult,
  AIResponse,
  DocType as DocumentType,
  InterviewQuestion,
  QuestionInput,
  DocumentInfo,
  InterviewProfile,
  AudioSource,
  AuthState,
} from '../types/shared'

export type {
  TranscriptResult,
  AIResponse,
  DocumentType,
  InterviewQuestion,
  QuestionInput,
  DocumentInfo,
  InterviewProfile,
  AudioSource,
  AuthState,
}

// 許可されたIPCチャンネルのホワイトリスト（セキュリティ向上）
const ALLOWED_SEND_CHANNELS = ['stt:audio'] as const
const ALLOWED_INVOKE_CHANNELS = [
  'stt:start',
  'stt:stop',
  'stt:status',
  'ai:init',
  'ai:generate',
  'ai:generateStream',
  'ai:generateStreamV2',
  'ai:summarize',
  'ai:prefetchContext',
  'ai:abort',
  'ai:isV2Available',
  'ai:resetV2',
  'ai:status',
  'context:init',
  'document:upload',
  'document:list',
  'document:remove',
  // 想定質問関連
  'questions:list',
  'questions:save',
  'questions:delete',
  // プロフィール関連
  'profile:get',
  'profile:save',
  // 認証関連
  'auth:getState',
  'auth:loginWithGoogle',
  'auth:validate',
  'auth:logout',
  'auth:getToken',
  // 音声キャプチャ関連 (Phase 6.5)
  'audio:setSource',
  'audio:getSource',
  // ウィンドウ操作
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  // サブスクリプション関連 (Phase 7)
  'subscription:getPlans',
  'subscription:checkout',
  'subscription:portal',
  'subscription:refresh',
] as const
const ALLOWED_ON_CHANNELS = [
  'stt:transcript',
  'ai:chunk',
  'ai:complete',
  'ai:error',
  'ai:phase',
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
    onStateChanged: (callback: (state: AuthState) => void): (() => void) => {
      const handler = (_event: unknown, state: AuthState) => callback(state)
      ipcRenderer.on('auth:stateChanged', handler)
      // 個別リスナーの解除関数を返す（removeAllListenersは他のインスタンスのリスナーも消すため使わない）
      return () => ipcRenderer.removeListener('auth:stateChanged', handler)
    },
  },

  // STT (音声認識) API
  stt: {
    // APIキーはMain processで環境変数から直接取得（セキュリティ向上）
    start: () => ipcRenderer.invoke('stt:start'),
    stop: () => {
      audioSendCount = 0 // カウンターをリセット
      return ipcRenderer.invoke('stt:stop')
    },
    sendAudio: (audioData: ArrayBuffer, source?: 'mic' | 'system') => {
      // ArrayBufferをUint8Arrayに変換してからIPC送信
      const uint8Array = new Uint8Array(audioData)
      audioSendCount++
      ipcRenderer.send('stt:audio', Array.from(uint8Array), source)
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
    generate: (question: string, context?: string, options?: { includeDocumentContext?: boolean; maxTokens?: number }) =>
      ipcRenderer.invoke('ai:generate', question, context, options),
    generateStream: (question: string, context?: string, options?: { includeDocumentContext?: boolean; maxTokens?: number }) =>
      ipcRenderer.invoke('ai:generateStream', question, context, options),
    generateStreamV2: (question: string, context?: string, phase?: 'speculative' | 'committed', options?: { includeDocumentContext?: boolean; maxTokens?: number; speculativeText?: string; turnId?: string }) =>
      ipcRenderer.invoke('ai:generateStreamV2', question, context, phase, options),
    summarize: (previousSummary: string, interviewer: string, candidate: string): Promise<{ success: boolean; summary?: string; error?: string }> =>
      ipcRenderer.invoke('ai:summarize', previousSummary, interviewer, candidate),
    prefetchContext: (): Promise<{ success: boolean; context?: string; error?: string }> =>
      ipcRenderer.invoke('ai:prefetchContext'),
    abort: () => ipcRenderer.invoke('ai:abort'),
    isV2Available: (): Promise<{ success: boolean; available?: boolean }> =>
      ipcRenderer.invoke('ai:isV2Available'),
    resetV2: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('ai:resetV2'),
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
    onPhase: (callback: (phase: string) => void) => {
      ipcRenderer.on('ai:phase', (_event, phase) => callback(phase))
    },
    removeListeners: () => {
      ipcRenderer.removeAllListeners('ai:chunk')
      ipcRenderer.removeAllListeners('ai:complete')
      ipcRenderer.removeAllListeners('ai:error')
      ipcRenderer.removeAllListeners('ai:phase')
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

  // Audio API (Phase 6.5: システム音声キャプチャ)
  audio: {
    setSource: (
      source: AudioSource
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('audio:setSource', source),
    getSource: (): Promise<{ success: boolean; source: AudioSource; error?: string }> =>
      ipcRenderer.invoke('audio:getSource'),
  },

  // Questions API (Phase 9: 想定質問)
  questions: {
    list: (): Promise<{ success: boolean; questions?: InterviewQuestion[]; error?: string }> =>
      ipcRenderer.invoke('questions:list'),
    save: (
      questions: QuestionInput[]
    ): Promise<{ success: boolean; questions?: InterviewQuestion[]; error?: string }> =>
      ipcRenderer.invoke('questions:save', questions),
    delete: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('questions:delete', id),
  },

  // Window API (カスタムタイトルバー)
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
  },

  // Profile API (面接プロフィール)
  profile: {
    get: (): Promise<{ success: boolean; profile?: InterviewProfile | null; error?: string }> =>
      ipcRenderer.invoke('profile:get'),
    save: (
      profile: InterviewProfile
    ): Promise<{ success: boolean; interviewProfile?: InterviewProfile; error?: string }> =>
      ipcRenderer.invoke('profile:save', profile),
  },


  // Subscription API (Phase 7: Stripe 決済)
  subscription: {
    getPlans: (): Promise<{ success: boolean; data?: unknown; error?: string }> =>
      ipcRenderer.invoke('subscription:getPlans'),
    checkout: (priceId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('subscription:checkout', priceId),
    portal: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('subscription:portal'),
    refresh: (): Promise<{ success: boolean; data?: unknown; error?: string }> =>
      ipcRenderer.invoke('subscription:refresh'),
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
