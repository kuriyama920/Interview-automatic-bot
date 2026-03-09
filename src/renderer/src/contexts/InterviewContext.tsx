/**
 * Interview Context
 * 面接セッションの全状態を管理
 * InterviewPage表示時のみマウント（他ページで不要なhook初期化を防ぐ）
 */

import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useSTT } from '../hooks/useSTT'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useAIResponse } from '../hooks/useAIResponse'
import { useProgressiveAI } from '../hooks/useProgressiveAI'
import { useConversationHistory } from '../hooks/useConversationHistory'
import { useDocumentContextCache } from '../hooks/useDocumentContextCache'
import { useToast } from '../hooks/useToast'
import { useNavigation } from './NavigationContext'

interface InterviewContextValue {
  // STT
  isConnected: boolean
  transcripts: TranscriptResult[]
  currentText: string
  currentSource: 'mic' | 'system' | undefined
  // Audio
  isCapturing: boolean
  audioSource: AudioSource
  setAudioSource: (source: AudioSource) => Promise<void>
  // AI
  aiResponse: AIResponse | null
  streamingText: string
  isGenerating: boolean
  currentPhase: string | null
  cachedMatch: { answer: string; similarity: number } | null
  // Actions
  handleStart: () => Promise<void>
  handleStop: () => Promise<void>
  handleClear: () => void
  refreshQuestionCache: () => Promise<void>
  // State
  error: string | null
  isLoading: boolean
}

const InterviewContext = createContext<InterviewContextValue | null>(null)

export function InterviewProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)

  const toast = useToast()
  const { setIsRecording } = useNavigation()

  const {
    isConnected,
    transcripts,
    currentText,
    currentSource,
    error: sttError,
    connect,
    disconnect,
    clearTranscripts,
  } = useSTT()

  const {
    isCapturing,
    error: captureError,
    audioSource,
    setAudioSource,
    startCapture,
    stopCapture,
  } = useAudioCapture()

  const {
    response: aiResponse,
    streamingText,
    isGenerating,
    error: aiError,
    currentPhase,
    generateStreamResponse,
    abortGeneration,
    clearResponse,
  } = useAIResponse()

  const conversationHistory = useConversationHistory({
    transcripts,
    audioSource,
  })

  const {
    cachedContextRef: cachedDocumentContextRef,
    prefetch: prefetchDocumentContext,
    clear: clearDocumentContextCache,
  } = useDocumentContextCache()

  const {
    cachedMatch,
    refreshQuestionCache,
    clearQuestionCache,
    resetProgressiveAI,
  } = useProgressiveAI({
    currentText,
    currentSource,
    audioSource,
    transcripts,
    autoGenerateAI: true,
    conversationHistory,
    cachedDocumentContextRef,
    generateStreamResponse,
    abortGeneration,
  })

  // 録音状態をナビゲーションコンテキストに同期
  useEffect(() => {
    setIsRecording(isCapturing)
  }, [isCapturing, setIsRecording])

  const handleStart = useCallback(async () => {
    setIsLoading(true)
    setAppError(null)
    resetProgressiveAI()
    clearResponse()

    try {
      // 並列で事前処理: ドキュメントコンテキスト取得 + OpenAI接続プリウォーム
      prefetchDocumentContext()
      window.electron.ai.warm().catch(() => {})
      await connect()
      await startCapture()
      toast.success('録音を開始しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : '予期しないエラーが発生しました'
      toast.error(message)
      try { await stopCapture() } catch { /* cleanup */ }
      try { await disconnect() } catch { /* cleanup */ }
    } finally {
      setIsLoading(false)
    }
  }, [connect, startCapture, stopCapture, disconnect, prefetchDocumentContext, resetProgressiveAI, clearResponse, toast])

  const handleStop = useCallback(async () => {
    setIsLoading(true)
    setAppError(null)

    try {
      await stopCapture()
      await disconnect()
      toast.info('録音を停止しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : '停止中にエラーが発生しました'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }, [stopCapture, disconnect, toast])

  const handleClear = useCallback(() => {
    abortGeneration()
    clearTranscripts()
    clearResponse()
    resetProgressiveAI()
    toast.info('クリアしました')
  }, [abortGeneration, clearTranscripts, clearResponse, resetProgressiveAI, toast])

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      clearQuestionCache()
      clearDocumentContextCache()
    }
  }, [clearQuestionCache, clearDocumentContextCache])

  const error = appError || sttError || captureError || aiError

  const value = useMemo<InterviewContextValue>(
    () => ({
      isConnected,
      transcripts,
      currentText,
      currentSource,
      isCapturing,
      audioSource,
      setAudioSource,
      aiResponse,
      streamingText,
      isGenerating,
      currentPhase,
      cachedMatch,
      handleStart,
      handleStop,
      handleClear,
      refreshQuestionCache,
      error,
      isLoading,
    }),
    [
      isConnected, transcripts, currentText, currentSource,
      isCapturing, audioSource, setAudioSource,
      aiResponse, streamingText, isGenerating, currentPhase, cachedMatch,
      handleStart, handleStop, handleClear, refreshQuestionCache,
      error, isLoading,
    ],
  )

  return <InterviewContext.Provider value={value}>{children}</InterviewContext.Provider>
}

export function useInterview(): InterviewContextValue {
  const context = useContext(InterviewContext)
  if (!context) {
    throw new Error('useInterview must be used within InterviewProvider')
  }
  return context
}
