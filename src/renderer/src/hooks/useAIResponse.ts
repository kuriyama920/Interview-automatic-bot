import { useState, useCallback, useEffect, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useAIResponse')

// AIResponse is the global ambient type declared in env.d.ts

/** Optional metrics recorder for latency tracking (A-17) */
export interface AIResponseMetrics {
  record: (turnId: string, point: string, value: number | boolean | string) => void
  finalize: (turnId: string) => void
}

interface UseAIResponseOptions {
  onMetrics?: AIResponseMetrics
}

interface UseAIResponseReturn {
  response: AIResponse | null
  streamingText: string
  isGenerating: boolean
  error: string | null
  currentPhase: AIPhase | null
  generateStreamResponse: (question: string, context?: string, options?: GenerateOptions) => Promise<void>
  generateStreamResponseV2: (question: string, context?: string, phase?: 'speculative' | 'committed', options?: GenerateOptions) => Promise<void>
  abortGeneration: () => void
  clearResponse: () => void
}

export function useAIResponse(options?: UseAIResponseOptions): UseAIResponseReturn {
  const [response, setResponse] = useState<AIResponse | null>(null)
  const [streamingText, setStreamingText] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [currentPhase, setCurrentPhase] = useState<AIPhase | null>(null)
  const mountedRef = useRef(true)
  const listenerSetup = useRef(false)
  const generationIdRef = useRef(0)
  const pendingClearRef = useRef(false)

  // Metrics tracking refs (A-17: m10-m12)
  const onMetricsRef = useRef(options?.onMetrics)
  onMetricsRef.current = options?.onMetrics
  const activeTurnIdRef = useRef<string | null>(null)
  const firstChunkRecordedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true

    if (!listenerSetup.current) {
      log.debug('Setting up AI listeners')

      window.electron.ai.onChunk((chunk: string) => {
        if (!mountedRef.current) return

        // A-17: Record m10 (first chunk received) and m12 (latest chunk received)
        const now = Date.now()
        const turnId = activeTurnIdRef.current
        if (turnId && onMetricsRef.current) {
          if (!firstChunkRecordedRef.current) {
            onMetricsRef.current.record(turnId, 'm10_chunkReceived', now)
            firstChunkRecordedRef.current = true
          }
          // m12 is always updated to the latest chunk timestamp
          onMetricsRef.current.record(turnId, 'm12_uiRendered', now)
        }

        // 新世代の最初のチャンク: 前の回答を置き換え（チラつき防止）
        // 注: リスナーは1回のみ登録されるため、世代チェックはgenerateStreamResponseの
        // IPC返り値側（line 168）で実施。ここではpendingClearRefで制御。
        if (pendingClearRef.current) {
          pendingClearRef.current = false
          log.debug('First chunk received (replacing)', { chunkLength: chunk.length })
          setStreamingText(chunk)

          // A-17: Record m11 (state updated) after first chunk sets state
          if (turnId && onMetricsRef.current) {
            onMetricsRef.current.record(turnId, 'm11_stateUpdated', Date.now())
          }
          return
        }
        setStreamingText((prev) => prev + chunk)

        // A-17: Record m11 (state updated) after appending chunk
        if (turnId && onMetricsRef.current && firstChunkRecordedRef.current) {
          onMetricsRef.current.record(turnId, 'm11_stateUpdated', Date.now())
        }
      })

      // onComplete はログのみ — レスポンス設定は IPC 返り値で行う（世代チェック付き）
      // ai:complete イベントには世代IDが含まれないため、レースコンディションの原因になる
      window.electron.ai.onComplete((aiResponse: AIResponse) => {
        if (!mountedRef.current) return
        log.debug('ai:complete event received (handled by IPC return)', {
          answerLength: aiResponse.answer.length,
          answerPreview: aiResponse.answer.substring(0, 80),
        })
      })

      window.electron.ai.onPhase((phase: string) => {
        if (!mountedRef.current) return
        log.info('Phase change received', { phase })
        setCurrentPhase(phase as AIPhase)
        // detailed フェーズ移行時: streamingTextをリセット（Phase 2の内容で置き換え）
        if (phase === 'detailed') {
          pendingClearRef.current = true
        }
      })

      window.electron.ai.onError((errorMessage: string) => {
        if (!mountedRef.current) return
        setError(errorMessage)
        setIsGenerating(false)
        setStreamingText('')
        log.error('AI stream error received', { error: errorMessage })
      })

      listenerSetup.current = true
    }

    return () => {
      log.debug('Cleanup - removing AI listeners')
      mountedRef.current = false
      window.electron.ai.removeListeners()
      listenerSetup.current = false
    }
  }, [])

  const abortGeneration = useCallback(() => {
    generationIdRef.current++
    window.electron.ai.abort()
    setIsGenerating(false)
    setStreamingText('')
    setCurrentPhase(null)
    pendingClearRef.current = false
    activeTurnIdRef.current = null
    firstChunkRecordedRef.current = false
    log.info('AI generation aborted by user')
  }, [])

  /** Shared IPC result handler for stream generation (v1 and v2) */
  const executeStreamGeneration = useCallback(async (
    ipcCall: () => Promise<{ success: boolean; response?: AIResponse; error?: string }>,
    thisGeneration: number,
    label: string,
  ) => {
    try {
      const result = await ipcCall()

      log.info(`${label} IPC returned`, {
        success: result.success,
        error: result.error,
        generationId: thisGeneration,
        isCurrent: generationIdRef.current === thisGeneration,
      })

      if (generationIdRef.current !== thisGeneration) return

      if (result.success) {
        if (result.response) {
          setResponse(result.response)
        }
        setIsGenerating(false)
        setCurrentPhase(null)

        // A-17: Finalize metrics on successful completion
        const turnId = activeTurnIdRef.current
        if (turnId && onMetricsRef.current) {
          onMetricsRef.current.finalize(turnId)
        }
        activeTurnIdRef.current = null
        firstChunkRecordedRef.current = false
      } else {
        if (result.error === 'aborted') return
        setError(result.error || 'Failed to generate response')
        setStreamingText('')
        setIsGenerating(false)
        activeTurnIdRef.current = null
        firstChunkRecordedRef.current = false
      }
    } catch (err) {
      if (generationIdRef.current !== thisGeneration) return
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      setStreamingText('')
      log.error(`${label} error`, { error: errorMessage })
      setIsGenerating(false)
      activeTurnIdRef.current = null
      firstChunkRecordedRef.current = false
    }
  }, [])

  const generateStreamResponse = useCallback(async (question: string, context?: string, options?: GenerateOptions) => {
    if (!question.trim()) {
      log.debug('generateStreamResponse: empty question, skipping')
      return
    }

    const thisGeneration = ++generationIdRef.current
    setIsGenerating(true)
    setError(null)
    setResponse(null)
    setCurrentPhase(null)
    pendingClearRef.current = true

    // A-17: Track turnId for metrics recording in chunk handler
    activeTurnIdRef.current = options?.turnId ?? null
    firstChunkRecordedRef.current = false

    log.info('generateStreamResponse called', {
      question: question.substring(0, 50),
      questionLength: question.length,
      generationId: thisGeneration,
    })

    await executeStreamGeneration(
      () => window.electron.ai.generateStream(question, context, options),
      thisGeneration,
      'generateStream',
    )
  }, [executeStreamGeneration])

  const generateStreamResponseV2 = useCallback(async (
    question: string,
    context?: string,
    phase?: 'speculative' | 'committed',
    options?: GenerateOptions,
  ) => {
    if (!question.trim()) {
      log.debug('generateStreamResponseV2: empty question, skipping')
      return
    }

    const thisGeneration = ++generationIdRef.current
    setIsGenerating(true)
    setError(null)
    setCurrentPhase(phase ?? null)

    if (phase === 'committed') {
      setResponse(null)
    }
    pendingClearRef.current = true

    // A-17: Track turnId for metrics recording in chunk handler
    activeTurnIdRef.current = options?.turnId ?? null
    firstChunkRecordedRef.current = false

    log.info('generateStreamResponseV2 called', {
      question: question.substring(0, 50),
      phase,
      generationId: thisGeneration,
    })

    await executeStreamGeneration(
      () => window.electron.ai.generateStreamV2(question, context, phase, options),
      thisGeneration,
      'generateStreamV2',
    )
  }, [executeStreamGeneration])

  const clearResponse = useCallback(() => {
    setResponse(null)
    setStreamingText('')
    setError(null)
    setCurrentPhase(null)
  }, [])

  return {
    response,
    streamingText,
    isGenerating,
    error,
    currentPhase,
    generateStreamResponse,
    generateStreamResponseV2,
    abortGeneration,
    clearResponse,
  }
}
