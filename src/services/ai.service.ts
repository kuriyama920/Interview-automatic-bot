import { createLogger } from './logger.service'
import { authService } from './auth.service'
import type { AIResponse, GenerateOptions } from '../types/shared'

export type { AIResponse, GenerateOptions }

const log = createLogger('ai-service')

export interface DoneData {
  responseId: string | null
  totalTokensUsed: number
  model: string | null
}

/** generateStreamResponse / generateStreamResponseV2 のコールバックをまとめたオブジェクト */
export interface StreamCallbacks {
  onChunk?: (chunk: string) => void
  onPhase?: (phase: string) => void
  onMetrics?: (metrics: WorkerMetrics) => void
  onDone?: (doneData: DoneData) => void
}

export interface WorkerMetrics {
  turnId: string
  m4?: number
  m5?: number
  m6?: number
  m6_timedOut?: boolean
  m7?: number
  m8?: number
  m9?: number
}

interface AIServiceConfig {
  apiBaseUrl: string
  model?: string
  maxTokens?: number
}

/** generate-v2 の4xxエラー（クライアントエラー）: v1 へのフォールバックは不要 */
class GenerateV2ClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerateV2ClientError'
  }
}

export class AIService {
  private config: AIServiceConfig | null = null
  private v2ConsecutiveFailures = 0

  /** onChunkコールバックに初回チャンク計測を付加するラッパー */
  private wrapOnChunkWithTiming(
    onChunk: ((chunk: string) => void) | undefined,
    startTime: number,
    label: string,
  ): { wrappedOnChunk: ((chunk: string) => void) | undefined; getFirstChunkTime: () => number } {
    let firstChunkTime = 0
    const wrappedOnChunk = onChunk
      ? (chunk: string) => {
          if (firstChunkTime === 0) {
            firstChunkTime = Date.now() - startTime
            log.info(label, { firstChunkMs: firstChunkTime })
          }
          onChunk(chunk)
        }
      : undefined
    return { wrappedOnChunk, getFirstChunkTime: () => firstChunkTime }
  }
  private v2Disabled = false
  private static readonly V2_MAX_CONSECUTIVE_FAILURES = 3

  isV2Available(): boolean {
    return !this.v2Disabled
  }

  resetV2(): void {
    this.v2ConsecutiveFailures = 0
    this.v2Disabled = false
  }

  private trackV2Failure(): void {
    this.v2ConsecutiveFailures++
    if (this.v2ConsecutiveFailures >= AIService.V2_MAX_CONSECUTIVE_FAILURES) {
      this.v2Disabled = true
      log.warn('v2 auto-disabled after consecutive failures', {
        failures: this.v2ConsecutiveFailures,
      })
    }
  }

  initialize(config: AIServiceConfig): void {
    this.config = {
      model: 'gpt-5-nano',
      maxTokens: 800,
      ...config,
    }

    log.info('AI service initialized (proxy mode)', {
      model: this.config.model,
      apiBaseUrl: this.config.apiBaseUrl,
    })
  }

  async generateResponse(question: string, context?: string, options?: GenerateOptions): Promise<AIResponse> {
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Generating response via proxy', { questionLength: question.length })

    const response = await authService.authenticatedFetch(
      `${this.config.apiBaseUrl}/api/ai/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          includeDocumentContext: options?.includeDocumentContext ?? true,
          model: this.config.model,
          maxTokens: options?.maxTokens ?? this.config.maxTokens,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(errorData.error || 'AI generation failed')
    }

    const fullContent = await this.parseSSEResponse(response)
    log.info('AI proxy response completed', { responseLength: fullContent.length })

    return this.parseResponse(fullContent)
  }

  async generateStreamResponse(
    question: string,
    context?: string,
    callbacks?: StreamCallbacks,
    signal?: AbortSignal,
    options?: GenerateOptions,
  ): Promise<AIResponse> {
    const { onChunk, onPhase, onMetrics, onDone } = callbacks ?? {}
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    const maxTokens = options?.maxTokens ?? this.config.maxTokens
    const includeDocumentContext = options?.includeDocumentContext ?? true

    const startTime = Date.now()
    log.info('Generating stream response via proxy', {
      questionLength: question.length,
      model: this.config.model,
      maxTokens,
      includeDocumentContext,
    })

    const response = await authService.authenticatedFetch(
      `${this.config.apiBaseUrl}/api/ai/generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.turnId && { 'X-Turn-Id': options.turnId }),
        },
        body: JSON.stringify({
          question,
          context,
          includeDocumentContext,
          model: this.config.model,
          maxTokens,
        }),
        signal,
      }
    )

    const ttfbMs = Date.now() - startTime
    log.info('API response received (TTFB)', { ttfbMs })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(errorData.error || 'AI generation failed')
    }

    const { wrappedOnChunk, getFirstChunkTime } = this.wrapOnChunkWithTiming(onChunk, startTime, 'First AI chunk received')

    const fullContent = await this.parseSSEResponse(response, { onChunk: wrappedOnChunk, onPhase, onMetrics, onDone }, signal)
    const totalMs = Date.now() - startTime
    log.info('AI proxy stream response completed', {
      responseLength: fullContent.length,
      ttfbMs,
      firstChunkMs: getFirstChunkTime(),
      totalMs,
    })

    return this.parseResponse(fullContent)
  }

  /**
   * SSE イベント1行を処理し、fullContent を更新して返す
   * @returns 更新後の fullContent
   * @throws エラーイベントまたはサイズ超過時
   */
  private processSSEEvent(
    data: Record<string, unknown>,
    fullContent: string,
    maxContentSize: number,
    callbacks?: StreamCallbacks,
  ): string {
    const { onChunk, onPhase, onMetrics, onDone } = callbacks ?? {}
    if (data.type === 'chunk' && data.content) {
      fullContent += data.content as string
      if (fullContent.length > maxContentSize) {
        throw new Error('SSE content exceeds maximum size')
      }
      if (onChunk) onChunk(data.content as string)
    } else if (data.type === 'phase' && data.phase) {
      if (data.phase === 'detailed') fullContent = ''
      if (onPhase) onPhase(data.phase as string)
    } else if (data.type === 'metrics' && data.data) {
      if (onMetrics) onMetrics(data.data as WorkerMetrics)
    } else if (data.type === 'done') {
      if (onDone) {
        onDone({
          responseId: (data.responseId as string) ?? null,
          totalTokensUsed: (data.tokensUsed as number) ?? 0,
          model: (data.model as string) ?? null,
        })
      }
    } else if (data.type === 'error') {
      throw new Error((data.error as string) || 'AI generation failed')
    }
    return fullContent
  }

  /**
   * SSE レスポンスをパース
   */
  private async parseSSEResponse(
    response: Response,
    callbacks?: StreamCallbacks,
    signal?: AbortSignal,
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const MAX_BUFFER_SIZE = 100 * 1024 // 100KB
    const MAX_CONTENT_SIZE = 1024 * 1024 // 1MB
    const SSE_READ_TIMEOUT_MS = 15_000 // 15秒: チャンク間の最大待機時間（非reasoningモデルでは十分）
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
      while (true) {
        if (signal?.aborted) break
        // タイムアウト付きread: チャンク間15秒以上の無応答でハング防止
        const { done, value } = await new Promise<{ done: boolean; value?: Uint8Array }>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error('SSE stream read timed out')), SSE_READ_TIMEOUT_MS)
          reader.read().then(
            (result) => { clearTimeout(timer); resolve(result) },
            (err) => { clearTimeout(timer); reject(err) },
          )
        })
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        if (buffer.length > MAX_BUFFER_SIZE) {
          throw new Error('SSE buffer overflow - malformed stream')
        }

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))
            fullContent = this.processSSEEvent(data, fullContent, MAX_CONTENT_SIZE, callbacks)
          } catch (parseError) {
            if (parseError instanceof SyntaxError) continue
            throw parseError
          }
        }
      }

      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6))
          fullContent = this.processSSEEvent(data, fullContent, MAX_CONTENT_SIZE, callbacks)
        } catch (parseError) {
          if (parseError instanceof SyntaxError) {
            // skip malformed JSON
          } else {
            throw parseError
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return fullContent
  }

  private parseResponse(content: string): AIResponse {
    return {
      answer: content.trim(),
      suggestions: [],
      confidence: -1,
    }
  }

  /**
   * generate-v2 エンドポイント呼び出し（Speculative/Committed Lane）
   * v2 失敗時は v1 へフォールバック
   */
  async generateStreamResponseV2(
    question: string,
    context: string | undefined,
    phase: 'speculative' | 'committed',
    callbacks?: StreamCallbacks,
    signal?: AbortSignal,
    options?: GenerateOptions,
  ): Promise<AIResponse> {
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    // v2 が無効化されている場合は直接 v1 を呼ぶ
    if (this.v2Disabled) {
      log.info('v2 is disabled due to consecutive failures, using v1 directly')
      return this.generateStreamResponse(question, context, callbacks, signal, options)
    }

    const { onChunk } = callbacks ?? {}
    const startTime = Date.now()
    log.info('Generating stream response v2 via proxy', {
      questionLength: question.length,
      phase,
    })

    try {
      const response = await authService.authenticatedFetch(
        `${this.config.apiBaseUrl}/api/ai/generate-v2`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(options?.turnId && { 'X-Turn-Id': options.turnId }),
          },
          body: JSON.stringify({
            question,
            context,
            phase,
            ...(options?.turnId && { turnId: options.turnId }),
            ...(options?.speculativeText && { speculativeText: options.speculativeText }),
          }),
          signal,
        }
      )

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          // 4xx errors (429 usage limit, 401 auth, 400 bad request): v1 も同様に失敗するためフォールバック不要
          // 4xx はカウンタに影響しない
          const errorData = await response.json().catch(() => ({})) as Record<string, string>
          log.warn('generate-v2 client error, not falling back to v1', { status: response.status })
          throw new GenerateV2ClientError(errorData.error || `AI generation failed (${response.status})`)
        }
        // 5xx errors: カウンタ増加 + v1 へフォールバック
        this.trackV2Failure()
        log.warn('generate-v2 server error, falling back to v1', { status: response.status })
        return this.generateStreamResponse(question, context, callbacks, signal, options)
      }

      const ttfbMs = Date.now() - startTime
      log.info('generate-v2 API response received (TTFB)', { ttfbMs, phase })

      // v2 成功: カウンタリセット
      this.v2ConsecutiveFailures = 0

      const { wrappedOnChunk } = this.wrapOnChunkWithTiming(onChunk, startTime, 'First v2 chunk received')

      const fullContent = await this.parseSSEResponse(response, { ...callbacks, onChunk: wrappedOnChunk }, signal)
      log.info('generate-v2 stream response completed', {
        responseLength: fullContent.length,
        ttfbMs,
        phase,
        totalMs: Date.now() - startTime,
      })

      return this.parseResponse(fullContent)
    } catch (error) {
      // 4xxエラー（クライアントエラー）またはアボートは再スロー、それ以外は v1 へフォールバック
      const isAborted = signal?.aborted
        || (error instanceof Error && (
          error.name === 'AbortError'
          || error.message.includes('aborted')
          || error.message.includes('abort')
        ))
      if (error instanceof GenerateV2ClientError || isAborted) {
        throw error
      }
      // unexpected エラー: カウンタ増加 + v1 へフォールバック
      this.trackV2Failure()
      log.warn('generate-v2 unexpected error, falling back to v1', { error: String(error) })
      return this.generateStreamResponse(question, context, callbacks, signal, options)
    }
  }

  /**
   * 対話ターンをバックグラウンドで要約（ローリングサマリー更新）
   */
  async summarizeTurn(
    previousSummary: string,
    interviewer: string,
    candidate: string,
  ): Promise<string> {
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Summarizing turn via proxy')

    const response = await authService.authenticatedFetch(
      `${this.config.apiBaseUrl}/api/ai/summarize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ previousSummary, interviewer, candidate }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(errorData.error || 'Summarization failed')
    }

    const data = await response.json() as { summary?: string }
    return data.summary || ''
  }

  async prefetchContext(): Promise<string> {
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Prefetching document context')

    const response = await authService.authenticatedFetch(
      `${this.config.apiBaseUrl}/api/ai/prefetch-context`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(errorData.error || 'Prefetch context failed')
    }

    const data = await response.json() as { context?: string }
    return data.context || ''
  }

  isInitialized(): boolean {
    return this.config !== null
  }
}

export const aiService = new AIService()
