/// <reference types="vite/client" />

import type {
  TranscriptResult as _TranscriptResult,
  AIResponse as _AIResponse,
  GenerateOptions as _GenerateOptions,
  DocType as _DocType,
  DocumentInfo as _DocumentInfo,
  InterviewQuestion as _InterviewQuestion,
  QuestionInput as _QuestionInput,
  InterviewProfile as _InterviewProfile,
  AudioSource as _AudioSource,
  SubscriptionTier as _SubscriptionTier,
  SubscriptionStatus as _SubscriptionStatus,
  User as _User,
  AuthState as _AuthState,
  UserUsage as _UserUsage,
} from '../../types/shared'

declare global {
  // shared型をグローバルに公開（既存コードの互換性維持）
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TranscriptResult extends _TranscriptResult {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AIResponse extends _AIResponse {}
  type DocType = _DocType
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface InterviewQuestion extends _InterviewQuestion {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface QuestionInput extends _QuestionInput {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface InterviewProfile extends _InterviewProfile {}
  type AudioSource = _AudioSource
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface DocumentInfo extends _DocumentInfo {}
  type SubscriptionTier = _SubscriptionTier
  type SubscriptionStatus = _SubscriptionStatus
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends _User {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AuthState extends _AuthState {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface UserUsage extends _UserUsage {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface GenerateOptions extends _GenerateOptions {}

  /** renderer固有: AI生成フェーズ */
  type AIPhase = 'speculative' | 'committed' | 'detailed'

  interface Window {
    electron: {
      auth: {
        getState: () => Promise<{ success: boolean; state?: AuthState; error?: string }>
        loginWithGoogle: () => Promise<{ success: boolean; error?: string }>
        validate: () => Promise<{ success: boolean; state?: AuthState; error?: string }>
        logout: () => Promise<{ success: boolean; state?: AuthState; error?: string }>
        getToken: () => Promise<{ success: boolean; token?: string | null; error?: string }>
        onStateChanged: (callback: (state: AuthState) => void) => () => void
      }
      stt: {
        start: () => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean; error?: string }>
        sendAudio: (audioData: ArrayBuffer, source?: 'mic' | 'system') => void
        status: () => Promise<{ connected: boolean }>
        onTranscript: (callback: (result: TranscriptResult) => void) => void
        removeTranscriptListener: () => void
      }
      ai: {
        init: (apiKey?: string) => Promise<{ success: boolean; error?: string }>
        generate: (
          question: string,
          context?: string,
          options?: GenerateOptions
        ) => Promise<{ success: boolean; response?: AIResponse; error?: string }>
        generateStream: (
          question: string,
          context?: string,
          options?: GenerateOptions
        ) => Promise<{ success: boolean; response?: AIResponse; error?: string }>
        generateStreamV2: (
          question: string,
          context?: string,
          phase?: 'speculative' | 'committed',
          options?: GenerateOptions
        ) => Promise<{ success: boolean; response?: AIResponse; error?: string }>
        summarize: (
          previousSummary: string,
          interviewer: string,
          candidate: string
        ) => Promise<{ success: boolean; summary?: string; error?: string }>
        prefetchContext: () => Promise<{ success: boolean; context?: string; error?: string }>
        abort: () => Promise<void>
        isV2Available: () => Promise<{ success: boolean; available?: boolean }>
        resetV2: () => Promise<{ success: boolean }>
        status: () => Promise<{ initialized: boolean }>
        onChunk: (callback: (chunk: string) => void) => void
        onComplete: (callback: (response: AIResponse) => void) => void
        onError: (callback: (error: string) => void) => void
        onPhase: (callback: (phase: string) => void) => void
        removeListeners: () => void
      }
      document: {
        init: () => Promise<{ success: boolean; error?: string }>
        upload: (type: DocType) => Promise<{
          success: boolean
          error?: string
          document?: DocumentInfo & { wordCount: number }
        }>
        list: () => Promise<{ success: boolean; documents: DocumentInfo[] }>
        remove: (id: string) => Promise<{ success: boolean; error?: string }>
      }
      audio: {
        setSource: (source: AudioSource) => Promise<{ success: boolean; error?: string }>
        getSource: () => Promise<{ success: boolean; source: AudioSource; error?: string }>
      }
      questions: {
        list: () => Promise<{ success: boolean; questions?: InterviewQuestion[]; error?: string }>
        save: (
          questions: QuestionInput[]
        ) => Promise<{ success: boolean; questions?: InterviewQuestion[]; error?: string }>
        delete: (id: string) => Promise<{ success: boolean; error?: string }>
        generate: () => Promise<{ success: boolean; error?: string }>
        generateAnswer: (question: string) => Promise<{ success: boolean; answer?: string; error?: string }>
        onGenerateQuestion: (callback: (data: { index: number; question: string; answer: string }) => void) => () => void
        onGenerateDone: (callback: (data: { total: number; tokens: number }) => void) => () => void
        onGenerateError: (callback: (message: string) => void) => () => void
        onAnswerChunk: (callback: (data: { chunk: string; accumulated: string }) => void) => () => void
        onAnswerDone: (callback: (data: { answer: string }) => void) => () => void
        onAnswerError: (callback: (message: string) => void) => () => void
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
      }
      profile: {
        get: () => Promise<{ success: boolean; profile?: InterviewProfile | null; error?: string }>
        save: (
          profile: InterviewProfile
        ) => Promise<{ success: boolean; interviewProfile?: InterviewProfile; error?: string }>
      }
      subscription: {
        getPlans: () => Promise<{ success: boolean; data?: unknown; error?: string }>
        checkout: (priceId: string) => Promise<{ success: boolean; error?: string }>
        portal: () => Promise<{ success: boolean; error?: string }>
        refresh: () => Promise<{ success: boolean; data?: unknown; error?: string }>
      }
      send: (channel: string, data: unknown) => void
      on: (channel: string, callback: (...args: unknown[]) => void) => void
      invoke: (channel: string, data?: unknown) => Promise<unknown>
      removeAllListeners: (channel: string) => void
    }
  }
}

export {}
