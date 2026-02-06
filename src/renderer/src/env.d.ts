/// <reference types="vite/client" />

interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
}

interface AIResponse {
  answer: string
  suggestions: string[]
  confidence: number
}

type DocumentType = 'resume' | 'job_posting'

type AudioSource = 'mic' | 'system' | 'both'

interface DocumentInfo {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
}

interface AppSettings {
  deepgramApiKey: string
  openaiApiKey: string
  theme: 'dark' | 'light'
  autoGenerateAI: boolean
  audioSource: AudioSource
  aiModel: 'gpt-5' | 'gpt-4o' | 'gpt-4o-mini'
  aiTemperature: number
  aiMaxTokens: number
  contextMinSimilarity: number
  contextTopK: number
  lastUpdated: number
  version: string
}

interface Window {
  electron: {
    config: {
      getApiKey: (keyName: string) => Promise<string | null>
    }
    stt: {
      start: () => Promise<{ success: boolean; error?: string }>
      stop: () => Promise<{ success: boolean; error?: string }>
      sendAudio: (audioData: ArrayBuffer) => void
      status: () => Promise<{ connected: boolean }>
      onTranscript: (callback: (result: TranscriptResult) => void) => void
      removeTranscriptListener: () => void
    }
    ai: {
      init: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
      generate: (
        question: string,
        context?: string
      ) => Promise<{ success: boolean; response?: AIResponse; error?: string }>
      generateStream: (
        question: string,
        context?: string
      ) => Promise<{ success: boolean; response?: AIResponse; error?: string }>
      status: () => Promise<{ initialized: boolean }>
      onChunk: (callback: (chunk: string) => void) => void
      onComplete: (callback: (response: AIResponse) => void) => void
      onError: (callback: (error: string) => void) => void
      removeListeners: () => void
    }
    document: {
      init: () => Promise<{ success: boolean; error?: string }>
      upload: (type: DocumentType) => Promise<{
        success: boolean
        error?: string
        document?: DocumentInfo & { wordCount: number }
      }>
      list: () => Promise<{ success: boolean; documents: DocumentInfo[] }>
      remove: (id: string) => Promise<{ success: boolean; error?: string }>
    }
    settings: {
      get: () => Promise<{ success: boolean; settings?: AppSettings; error?: string }>
      save: (
        settings: Partial<AppSettings>
      ) => Promise<{ success: boolean; settings?: AppSettings; error?: string }>
      reset: () => Promise<{ success: boolean; settings?: AppSettings; error?: string }>
      getEffectiveApiKey: (
        keyType: 'deepgram' | 'openai'
      ) => Promise<{ success: boolean; key?: string | null }>
    }
    audio: {
      setSource: (source: AudioSource) => Promise<{ success: boolean; error?: string }>
      getSource: () => Promise<{ success: boolean; source: AudioSource; error?: string }>
    }
    send: (channel: string, data: unknown) => void
    on: (channel: string, callback: (...args: unknown[]) => void) => void
    invoke: (channel: string, data?: unknown) => Promise<unknown>
    removeAllListeners: (channel: string) => void
  }
}
