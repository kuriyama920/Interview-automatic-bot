import { createLogger } from './logger.service'
import { authService } from './auth.service'

const log = createLogger('ai-service')

export interface AIResponse {
  answer: string
  suggestions: string[]
  /** Confidence score 0-1, or -1 if not computed (SSE streaming mode) */
  confidence: number
}

export interface GenerateOptions {
  includeDocumentContext?: boolean
  maxTokens?: number
  predictedAnswer?: string
  cascading?: boolean
}

interface AIServiceConfig {
  apiBaseUrl: string
  model?: string
  maxTokens?: number
}

export class AIService {
  private config: AIServiceConfig | null = null

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
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    options?: GenerateOptions,
    onPhase?: (phase: string) => void,
  ): Promise<AIResponse> {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          includeDocumentContext,
          model: this.config.model,
          maxTokens,
          ...(options?.predictedAnswer && { predictedAnswer: options.predictedAnswer }),
          ...(options?.cascading && { cascading: true }),
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

    let firstChunkTime = 0
    const wrappedOnChunk = onChunk
      ? (chunk: string) => {
          if (firstChunkTime === 0) {
            firstChunkTime = Date.now() - startTime
            log.info('First AI chunk received', { firstChunkMs: firstChunkTime })
          }
          onChunk(chunk)
        }
      : undefined

    const fullContent = await this.parseSSEResponse(response, wrappedOnChunk, signal, onPhase)
    const totalMs = Date.now() - startTime
    log.info('AI proxy stream response completed', {
      responseLength: fullContent.length,
      ttfbMs,
      firstChunkMs: firstChunkTime,
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
    onChunk?: (chunk: string) => void,
    onPhase?: (phase: string) => void,
  ): string {
    if (data.type === 'chunk' && data.content) {
      fullContent += data.content as string
      if (fullContent.length > maxContentSize) {
        throw new Error('SSE content exceeds maximum size')
      }
      if (onChunk) onChunk(data.content as string)
    } else if (data.type === 'phase' && data.phase) {
      if (data.phase === 'detailed') fullContent = ''
      if (onPhase) onPhase(data.phase as string)
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
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
    onPhase?: (phase: string) => void,
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
            fullContent = this.processSSEEvent(data, fullContent, MAX_CONTENT_SIZE, onChunk, onPhase)
          } catch (parseError) {
            if (parseError instanceof SyntaxError) continue
            throw parseError
          }
        }
      }

      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6))
          fullContent = this.processSSEEvent(data, fullContent, MAX_CONTENT_SIZE, onChunk, onPhase)
        } catch (parseError) {
          if (parseError instanceof Error && !parseError.message.includes('JSON')) {
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

  async warmConnection(): Promise<void> {
    if (!this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Warming up OpenAI connection')

    try {
      await authService.authenticatedFetch(
        `${this.config.apiBaseUrl}/api/ai/warm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )
      log.info('OpenAI connection warmed up')
    } catch (error) {
      log.warn('Connection warm-up failed (non-blocking)', { error: String(error) })
    }
  }

  isInitialized(): boolean {
    return this.config !== null
  }
}

export const aiService = new AIService()
