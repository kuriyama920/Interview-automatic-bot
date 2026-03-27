import { useState, useCallback, useEffect, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useAIResponse')

/** Optional metrics recorder for latency tracking */
export interface AIResponseMetrics {
  record: (turnId: string, point: string, value: number | boolean | string) => void
  finalize: (turnId: string) => void
}

interface UseAIResponseOptions {
  onMetrics?: AIResponseMetrics
}

/** Speculative採用時のデフォルトconfidence */
const SPECULATIVE_ADOPTED_CONFIDENCE = 0.8

interface UseAIResponseReturn {
  response: AIResponse | null
  streamingText: string
  isGenerating: boolean
  error: string | null
  currentPhase: AIPhase | null
  committedStreamingText: string
  committedResponse: AIResponse | null
  applyCommittedResult: (committed: { response: AIResponse | null; streamingText: string }) => void
  discardCommittedResult: (speculativeText: string) => void
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

  // 二重バッファ: Committed用バックバッファ
  const [committedStreamingText, setCommittedStreamingText] = useState<string>('')
  const [committedResponse, setCommittedResponse] = useState<AIResponse | null>(null)

  const mountedRef = useRef(true)
  const listenerSetup = useRef(false)
  const generationIdRef = useRef(0)
  const pendingClearRef = useRef(false)

  // Committed用の別pendingClear + phase判別用ref
  const pendingCommittedClearRef = useRef(false)
  const currentPhaseRef = useRef<AIPhase | null>(null)

  // Metrics tracking refs
  const onMetricsRef = useRef(options?.onMetrics)
  onMetricsRef.current = options?.onMetrics
  const activeTurnIdRef = useRef<string | null>(null)
  const firstChunkRecordedRef = useRef(false)

  // 共通リセットヘルパー（useCallbackで安定参照化 - exhaustive-deps準拠）
  const resetCommittedBuffer = useCallback(() => {
    setCommittedStreamingText('')
    setCommittedResponse(null)
  }, [])

  const resetPhase = useCallback(() => {
    setCurrentPhase(null)
    currentPhaseRef.current = null
  }, [])

  const resetMetrics = useCallback(() => {
    activeTurnIdRef.current = null
    firstChunkRecordedRef.current = false
  }, [])

  /** phase-aware: エラー時にアクティブなバッファのみクリア */
  const clearBufferOnError = useCallback(() => {
    if (currentPhaseRef.current === 'committed') {
      resetCommittedBuffer()
    } else {
      setStreamingText('')
    }
  }, [resetCommittedBuffer])

  useEffect(() => {
    mountedRef.current = true

    if (!listenerSetup.current) {
      log.debug('Setting up AI listeners')

      window.electron.ai.onChunk((chunk: string) => {
        if (!mountedRef.current) return

        const now = Date.now()
        const turnId = activeTurnIdRef.current
        if (turnId && onMetricsRef.current) {
          if (!firstChunkRecordedRef.current) {
            onMetricsRef.current.record(turnId, 'm10_chunkReceived', now)
            firstChunkRecordedRef.current = true
          }
          onMetricsRef.current.record(turnId, 'm12_uiRendered', now)
        }

        // phase振り分け: currentPhaseRefを参照してバッファを決定
        const isCommittedPhase = currentPhaseRef.current === 'committed'

        if (isCommittedPhase) {
          // Committed チャンク → バックバッファに蓄積
          if (pendingCommittedClearRef.current) {
            pendingCommittedClearRef.current = false
            log.debug('First committed chunk received (replacing)', { chunkLength: chunk.length })
            setCommittedStreamingText(chunk)
          } else {
            setCommittedStreamingText((prev) => prev + chunk)
          }
        } else {
          // Speculative チャンク → フロントバッファ
          if (pendingClearRef.current) {
            pendingClearRef.current = false
            log.debug('First chunk received (replacing)', { chunkLength: chunk.length })
            setStreamingText(chunk)

            if (turnId && onMetricsRef.current) {
              onMetricsRef.current.record(turnId, 'm11_stateUpdated', Date.now())
            }
            return
          }
          setStreamingText((prev) => prev + chunk)
        }

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
        currentPhaseRef.current = phase as AIPhase
        // detailed フェーズ移行時: streamingTextをリセット（detailedフェーズの内容で上書きするため）
        if (phase === 'detailed') {
          pendingClearRef.current = true
        }
      })

      // phase-aware onError: Committed エラー時は Speculative を保持
      window.electron.ai.onError((errorMessage: string) => {
        if (!mountedRef.current) return
        const wasCommitted = currentPhaseRef.current === 'committed'
        setError(errorMessage)
        setIsGenerating(false)
        clearBufferOnError()
        pendingCommittedClearRef.current = false
        resetPhase()
        if (wasCommitted) {
          log.warn('AI committed stream error (speculative preserved)', { error: errorMessage })
        } else {
          log.error('AI stream error received', { error: errorMessage })
        }
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
    try {
      window.electron.ai.abort()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown abort error'
      log.warn('abort() threw, continuing cleanup', { error: errorMessage })
    }
    setIsGenerating(false)
    setStreamingText('')
    pendingClearRef.current = false
    resetCommittedBuffer()
    pendingCommittedClearRef.current = false
    resetPhase()
    resetMetrics()
    log.info('AI generation aborted by user')
  }, [resetCommittedBuffer, resetPhase, resetMetrics])

  /** Shared IPC result handler for stream generation (v1 and v2) */
  const executeStreamGeneration = useCallback(async (
    ipcCall: () => Promise<{ success: boolean; response?: AIResponse; error?: string }>,
    thisGeneration: number,
    label: string,
  ) => {
    function handleError(errorMessage: string) {
      setError(errorMessage)
      clearBufferOnError()
      setIsGenerating(false)
      resetPhase()
      resetMetrics()
    }

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
          if (currentPhaseRef.current === 'committed') {
            setCommittedResponse(result.response)
          } else {
            setResponse(result.response)
          }
        }
        setIsGenerating(false)
        // Speculative完了時はphaseをnullに（Committedはw-01で処理）
        if (currentPhaseRef.current !== 'committed') {
          resetPhase()
        }

        // Finalize metrics on successful completion
        const turnId = activeTurnIdRef.current
        if (turnId && onMetricsRef.current) {
          onMetricsRef.current.finalize(turnId)
        }
        resetMetrics()
      } else {
        if (result.error === 'aborted') return
        handleError(result.error || 'Failed to generate response')
      }
    } catch (err) {
      if (generationIdRef.current !== thisGeneration) return
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      log.error(`${label} error`, { error: errorMessage })
      handleError(errorMessage)
    }
  }, [clearBufferOnError, resetPhase, resetMetrics])

  const generateStreamResponse = useCallback(async (question: string, context?: string, options?: GenerateOptions) => {
    if (!question.trim()) {
      log.debug('generateStreamResponse: empty question, skipping')
      return
    }

    const thisGeneration = ++generationIdRef.current
    setIsGenerating(true)
    setError(null)
    setResponse(null)
    resetPhase()
    pendingClearRef.current = true

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
  }, [executeStreamGeneration, resetPhase])

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
    currentPhaseRef.current = phase ?? null

    if (phase === 'committed') {
      // Speculative側は触らない → チラつき防止の核心
      resetCommittedBuffer()
      pendingCommittedClearRef.current = true
    } else {
      pendingClearRef.current = true
    }

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
  }, [executeStreamGeneration, resetCommittedBuffer])

  const clearResponse = useCallback(() => {
    setResponse(null)
    setStreamingText('')
    setError(null)
    resetCommittedBuffer()
    resetPhase()
  }, [resetCommittedBuffer, resetPhase])

  // Speculative採用時: Speculative表示を確定し、Committed結果は不要なので破棄
  const discardCommittedResult = useCallback((speculativeText: string) => {
    setResponse({ answer: speculativeText, suggestions: [], confidence: SPECULATIVE_ADOPTED_CONFIDENCE })
    resetCommittedBuffer()
    resetPhase()
  }, [resetCommittedBuffer, resetPhase])

  // Speculative不採用時: 引数でCommitted結果を受け取る（stale closure回避）
  const applyCommittedResult = useCallback((committed: { response: AIResponse | null; streamingText: string }) => {
    if (committed.response) {
      setResponse(committed.response)
      setStreamingText(committed.response.answer)
    } else {
      setStreamingText(committed.streamingText)
    }
    resetCommittedBuffer()
    resetPhase()
  }, [resetCommittedBuffer, resetPhase])

  return {
    response,
    streamingText,
    isGenerating,
    error,
    currentPhase,
    committedStreamingText,
    committedResponse,
    applyCommittedResult,
    discardCommittedResult,
    generateStreamResponse,
    generateStreamResponseV2,
    abortGeneration,
    clearResponse,
  }
}
