/**
 * Interview Context
 * 面接セッションの全状態を管理
 * InterviewPage表示時のみマウント（他ページで不要なhook初期化を防ぐ）
 */

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { shouldAdoptSpeculative, DEFAULT_ADOPTION_CONFIG } from '../utils/speculative-adoption'
import { AdaptiveThreshold } from '../utils/adaptive-threshold'
import { createLogger } from '../utils/logger'

const log = createLogger('InterviewContext')
import { useSTT } from '../hooks/useSTT'
import { useAudioCapture } from '../hooks/useAudioCapture'
import { useAIResponse } from '../hooks/useAIResponse'
import { useProgressiveAI } from '../hooks/useProgressiveAI'
import { useConversationHistory, RECENT_TURN_COUNT } from '../hooks/useConversationHistory'
import { useDocumentContextCache } from '../hooks/useDocumentContextCache'
import { useLatencyMetrics } from '../hooks/useLatencyMetrics'
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
  currentPhase: AIPhase | null
  cachedMatch: { answer: string; similarity: number } | null
  // 採用判定UI状態
  adoptionState: 'none' | 'adopted' | 'replaced'
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

  // レイテンシ計測基盤 — useAIResponseより先に初期化
  const latencyMetrics = useLatencyMetrics()

  const {
    response: aiResponse,
    streamingText,
    isGenerating,
    error: aiError,
    currentPhase,
    committedStreamingText,
    committedResponse,
    applyCommittedResult,
    discardCommittedResult,
    generateStreamResponse,
    generateStreamResponseV2,
    abortGeneration,
    clearResponse,
  } = useAIResponse({ onMetrics: latencyMetrics })

  // speculativeTextRef: Speculative生成中のstreamingTextを保持（Committed Laneでの比較用）
  const speculativeTextRef = useRef<string>('')

  // speculativeTextRef 同期（streamingText変更でトリガー）
  useEffect(() => {
    if (currentPhase === 'speculative') {
      speculativeTextRef.current = streamingText
    }
  }, [currentPhase, streamingText])

  // 採用判定結果のUI状態
  const [adoptionState, setAdoptionState] = useState<'none' | 'adopted' | 'replaced'>('none')

  // adoptionState リセット（currentPhase変更のみでトリガー）
  useEffect(() => {
    if (currentPhase === 'speculative') {
      setAdoptionState('none')
    }
  }, [currentPhase])

  const {
    historyString: conversationHistory,
    triggerSummarize,
    resetSummary,
    turnCount,
  } = useConversationHistory({
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
    pendingCommittedTurnIdRef,
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
    generateStreamResponseV2,
    speculativeTextRef,
    onMetrics: latencyMetrics,
  })

  // 録音状態をナビゲーションコンテキストに同期
  useEffect(() => {
    setIsRecording(isCapturing)
  }, [isCapturing, setIsRecording])

  // F-2b: Adaptive Threshold - 採用率ベースの動的閾値調整
  const adaptiveThresholdRef = useRef(new AdaptiveThreshold())

  // Speculative採用判定（Committed完了後に実行）
  const prevIsGeneratingRef = useRef(false)
  useEffect(() => {
    const wasGenerating = prevIsGeneratingRef.current
    prevIsGeneratingRef.current = isGenerating

    // isGenerating: true → false の遷移を検知
    if (wasGenerating && !isGenerating && pendingCommittedTurnIdRef.current) {
      const turnId = pendingCommittedTurnIdRef.current
      const specText = speculativeTextRef.current
      // バックバッファのスナップショットを取得（stale closure回避）
      const committedSnapshot = { response: committedResponse, streamingText: committedStreamingText }
      const committedText = committedSnapshot.response?.answer || committedSnapshot.streamingText

      if (specText && committedText) {
        // 採用判定とメトリクス記録を分離（メトリクス失敗で決定が失われないように）
        try {
          const adaptiveConfig = {
            ...DEFAULT_ADOPTION_CONFIG,
            changeRateThreshold: adaptiveThresholdRef.current.getThreshold(),
          }
          const result = shouldAdoptSpeculative(specText, committedText, adaptiveConfig)

          if (result.adopted) {
            discardCommittedResult(specText)
            setAdoptionState('adopted')
          } else {
            applyCommittedResult(committedSnapshot)
            setAdoptionState('replaced')
          }

          // メトリクス記録は非クリティカル
          try {
            adaptiveThresholdRef.current.recordAdoption(result.adopted)
            latencyMetrics.record(turnId, 'speculative_adopted', result.adopted)
            latencyMetrics.record(turnId, 'speculative_changeRate', result.changeRate)
            latencyMetrics.record(turnId, 'speculative_reason', result.reason)
            latencyMetrics.record(turnId, 'adaptive_threshold', adaptiveConfig.changeRateThreshold)
          } catch (metricsErr) {
            log.error('Metrics recording failed (non-critical)', metricsErr)
          }
        } catch (err) {
          // 採用判定失敗時は安全側にフォールバック: Committed結果を採用
          log.error('Adoption decision failed, falling back to committed result', err)
          applyCommittedResult(committedSnapshot)
          setAdoptionState('replaced')
        }
      } else if (!specText && (committedSnapshot.response || committedSnapshot.streamingText)) {
        // Speculativeなし → Committed結果をそのまま適用
        applyCommittedResult(committedSnapshot)
        setAdoptionState('none')
      }

      pendingCommittedTurnIdRef.current = null

      if (turnCount > RECENT_TURN_COUNT) {
        triggerSummarize()
      }
    }
  }, [isGenerating, committedResponse, committedStreamingText, latencyMetrics, pendingCommittedTurnIdRef, turnCount, triggerSummarize, applyCommittedResult, discardCommittedResult])

  const handleStart = useCallback(async () => {
    setIsLoading(true)
    setAppError(null)
    resetSummary()
    resetProgressiveAI()
    clearResponse()

    try {
      // ドキュメントコンテキスト事前取得
      prefetchDocumentContext()
      await connect()
      await startCapture()
      toast.success('録音を開始しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : '予期しないエラーが発生しました'
      toast.error(message)
      try { await stopCapture() } catch (cleanupErr) { log.error('handleStart cleanup: stopCapture failed', cleanupErr) }
      try { await disconnect() } catch (cleanupErr) { log.error('handleStart cleanup: disconnect failed', cleanupErr) }
    } finally {
      setIsLoading(false)
    }
  }, [connect, startCapture, stopCapture, disconnect, prefetchDocumentContext, resetSummary, resetProgressiveAI, clearResponse, toast])

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
    resetSummary()
    resetProgressiveAI()
    toast.info('クリアしました')
  }, [abortGeneration, clearTranscripts, clearResponse, resetSummary, resetProgressiveAI, toast])

  // アンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      clearQuestionCache()
      clearDocumentContextCache()
    }
  }, [clearQuestionCache, clearDocumentContextCache])

  // aiErrorを最優先、それ以外はインフラエラーを優先
  const error = aiError || appError || sttError || captureError

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
      adoptionState,
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
      adoptionState,
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
