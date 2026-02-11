import { useState, useCallback, useEffect, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useAIResponse')

interface AIResponse {
  answer: string
  suggestions: string[]
  confidence: number
}

interface UseAIResponseReturn {
  response: AIResponse | null
  streamingText: string
  isGenerating: boolean
  error: string | null
  generateResponse: (question: string, context?: string) => Promise<void>
  generateStreamResponse: (question: string, context?: string) => Promise<void>
  abortGeneration: () => void
  clearResponse: () => void
}

export function useAIResponse(): UseAIResponseReturn {
  const [response, setResponse] = useState<AIResponse | null>(null)
  const [streamingText, setStreamingText] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const listenerSetup = useRef(false)
  const generationIdRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true

    if (!listenerSetup.current) {
      log.debug('Setting up AI listeners')

      window.electron.ai.onChunk((chunk: string) => {
        if (!mountedRef.current) return
        setStreamingText((prev) => prev + chunk)
      })

      window.electron.ai.onComplete((aiResponse: AIResponse) => {
        if (!mountedRef.current) return
        setResponse(aiResponse)
        setIsGenerating(false)
        log.info('AI response completed')
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

  const generateResponse = useCallback(async (question: string, context?: string) => {
    if (!question.trim()) {
      return
    }

    setIsGenerating(true)
    setError(null)
    setResponse(null)
    log.info('Generating AI response', { questionLength: question.length })

    try {
      const result = await window.electron.ai.generate(question, context)

      if (result.success && result.response) {
        setResponse(result.response)
        log.info('AI response received')
      } else {
        setError(result.error || 'Failed to generate response')
        log.error('AI generation failed', { error: result.error })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      log.error('AI generation error', { error: errorMessage })
    } finally {
      setIsGenerating(false)
    }
  }, [])

  const abortGeneration = useCallback(() => {
    generationIdRef.current++
    window.electron.ai.abort()
    setIsGenerating(false)
    setStreamingText('')
    log.info('AI generation aborted by user')
  }, [])

  const generateStreamResponse = useCallback(async (question: string, context?: string) => {
    if (!question.trim()) {
      return
    }

    const thisGeneration = ++generationIdRef.current
    setIsGenerating(true)
    setError(null)
    setResponse(null)
    setStreamingText('')
    log.info('Generating AI stream response', { questionLength: question.length })

    try {
      const result = await window.electron.ai.generateStream(question, context)

      // この生成が最新でない場合は無視（abort後に新しい生成が開始された）
      if (generationIdRef.current !== thisGeneration) return

      if (!result.success) {
        if (result.error === 'aborted') return // 意図的な中断
        setError(result.error || 'Failed to generate response')
        setStreamingText('')
        log.error('AI stream generation failed', { error: result.error })
        setIsGenerating(false)
      }
    } catch (err) {
      if (generationIdRef.current !== thisGeneration) return
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      setStreamingText('')
      log.error('AI stream generation error', { error: errorMessage })
      setIsGenerating(false)
    }
  }, [])

  const clearResponse = useCallback(() => {
    setResponse(null)
    setStreamingText('')
    setError(null)
  }, [])

  return {
    response,
    streamingText,
    isGenerating,
    error,
    generateResponse,
    generateStreamResponse,
    abortGeneration,
    clearResponse,
  }
}
