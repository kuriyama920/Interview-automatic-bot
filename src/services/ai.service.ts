import OpenAI from 'openai'
import { createLogger } from './logger.service'
import { authService } from './auth.service'

const log = createLogger('ai-service')

export interface AIResponse {
  answer: string
  suggestions: string[]
  confidence: number
}

interface AIServiceConfig {
  apiKey?: string
  useProxy?: boolean
  apiBaseUrl?: string
  model?: string
  maxTokens?: number
}

// 正規定義: apps/api/lib/prompts.ts（Electronからは直接importできないためコピー）
const SYSTEM_PROMPT = `あなたは面接コーチです。面接官の質問に対する最適な回答を即座に提案します。
質問が途中や断片的でも、意図を推測して回答してください。
回答形式：結論→根拠→具体例の順。数値・固有名詞で説得力を高める。日本語で簡潔に（3-5文）。`

// reasoning_effort をサポートするモデル（GPT-5系推論モデル）
const MODELS_WITH_REASONING = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5']

export class AIService {
  private client: OpenAI | null = null
  private config: AIServiceConfig | null = null
  private useProxy = false
  private apiBaseUrl = ''

  initialize(config: AIServiceConfig): void {
    this.useProxy = config.useProxy ?? !config.apiKey
    this.apiBaseUrl = config.apiBaseUrl || ''

    this.config = {
      model: 'gpt-5-nano',
      maxTokens: 2000,
      ...config,
    }

    if (!this.useProxy && config.apiKey) {
      this.client = new OpenAI({
        apiKey: config.apiKey,
      })
    }

    log.info('AI service initialized', {
      model: this.config.model,
      useProxy: this.useProxy,
    })
  }

  async generateResponse(question: string, context?: string): Promise<AIResponse> {
    if (this.useProxy) {
      return this.generateViaProxy(question, context)
    }

    if (!this.client || !this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Generating response for question', { questionLength: question.length })

    const userMessage = context
      ? `コンテキスト情報:\n${context}\n\n面接官の質問: ${question}`
      : `面接官の質問: ${question}`

    try {
      const response = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: this.config.maxTokens,
        ...(MODELS_WITH_REASONING.includes(this.config.model!) && { reasoning_effort: 'minimal' as const }),
      })

      const content = response.choices[0]?.message?.content || ''
      log.info('AI response generated', { responseLength: content.length })

      return this.parseResponse(content)
    } catch (error) {
      log.error('Failed to generate AI response', { error })
      throw error
    }
  }

  async generateStreamResponse(
    question: string,
    context?: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    if (this.useProxy) {
      return this.generateStreamViaProxy(question, context, onChunk, signal)
    }

    if (!this.client || !this.config) {
      throw new Error('AI service not initialized')
    }

    log.info('Generating stream response', {
      questionLength: question.length,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
    })

    const userMessage = context
      ? `コンテキスト情報:\n${context}\n\n面接官の質問: ${question}`
      : `面接官の質問: ${question}`

    try {
      log.debug('Creating OpenAI stream', {
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        messageCount: 2,
        userMessageLength: userMessage.length,
      })
      const stream = await this.client.chat.completions.create(
        {
          model: this.config.model!,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          max_completion_tokens: this.config.maxTokens,
          ...(MODELS_WITH_REASONING.includes(this.config.model!) && { reasoning_effort: 'minimal' as const }),
          stream: true,
        },
        { signal }
      )

      let fullContent = ''
      let chunkCount = 0
      let totalChunks = 0

      for await (const chunk of stream) {
        totalChunks++
        if (signal?.aborted) {
          log.info('Stream aborted mid-iteration', { totalChunks })
          break
        }

        const choice = chunk.choices[0]
        const content = choice?.delta?.content || ''
        const finishReason = choice?.finish_reason

        // 最初の数チャンクと完了理由をログ
        if (totalChunks <= 3 || finishReason) {
          log.debug('Stream chunk', {
            n: totalChunks,
            hasContent: !!content,
            contentLen: content.length,
            finishReason,
            delta: JSON.stringify(choice?.delta),
          })
        }

        fullContent += content
        if (onChunk && content) {
          chunkCount++
          onChunk(content)
        }
      }

      log.info('AI stream response completed', {
        responseLength: fullContent.length,
        chunkCount,
        totalChunks,
        contentPreview: fullContent.substring(0, 100),
      })

      return this.parseResponse(fullContent)
    } catch (error) {
      if (signal?.aborted) {
        throw new Error('aborted')
      }
      log.error('Failed to generate AI stream response', { error })
      throw error
    }
  }

  /**
   * プロキシ経由で AI 回答を生成（非ストリーミング）
   */
  private async generateViaProxy(
    question: string,
    context?: string
  ): Promise<AIResponse> {
    log.debug('Generating response via proxy', { questionLength: question.length })

    const response = await authService.authenticatedFetch(
      `${this.apiBaseUrl}/api/ai/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          includeDocumentContext: true,
          model: this.config?.model,
          maxTokens: this.config?.maxTokens,
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'AI generation failed')
    }

    // SSE レスポンスをパースして全コンテンツを収集
    const fullContent = await this.parseSSEResponse(response)
    log.info('AI proxy response completed', { responseLength: fullContent.length })

    return this.parseResponse(fullContent)
  }

  /**
   * プロキシ経由で AI 回答をストリーミング生成
   */
  private async generateStreamViaProxy(
    question: string,
    context?: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    log.debug('Generating stream response via proxy', { questionLength: question.length })

    const response = await authService.authenticatedFetch(
      `${this.apiBaseUrl}/api/ai/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          context,
          includeDocumentContext: true,
          model: this.config?.model,
          maxTokens: this.config?.maxTokens,
        }),
        signal,
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'AI generation failed')
    }

    const fullContent = await this.parseSSEResponse(response, onChunk, signal)
    log.info('AI proxy stream response completed', { responseLength: fullContent.length })

    return this.parseResponse(fullContent)
  }

  /**
   * SSE レスポンスをパース
   */
  private async parseSSEResponse(
    response: Response,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const MAX_BUFFER_SIZE = 100 * 1024 // 100KB
    const MAX_CONTENT_SIZE = 1024 * 1024 // 1MB
    const decoder = new TextDecoder()
    let fullContent = ''
    let buffer = ''

    try {
      while (true) {
        if (signal?.aborted) break
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // バッファサイズ制限チェック（不正なストリーム対策）
        if (buffer.length > MAX_BUFFER_SIZE) {
          throw new Error('SSE buffer overflow - malformed stream')
        }

        // SSE イベントを行ごとにパース
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue

          try {
            const data = JSON.parse(line.slice(6))

            if (data.type === 'chunk' && data.content) {
              fullContent += data.content
              if (fullContent.length > MAX_CONTENT_SIZE) {
                throw new Error('SSE content exceeds maximum size')
              }
              if (onChunk) {
                onChunk(data.content)
              }
            } else if (data.type === 'error') {
              throw new Error(data.error || 'AI generation failed')
            }
          } catch (parseError) {
            // JSON パースエラーは無視（不完全なデータ）
            if (parseError instanceof SyntaxError) continue
            throw parseError
          }
        }
      }

      // ストリーム終了後にバッファに残ったデータを処理
      // （最後のSSEイベントに末尾の改行がない場合の防御策）
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6))
          if (data.type === 'chunk' && data.content) {
            fullContent += data.content
            if (fullContent.length > MAX_CONTENT_SIZE) {
              throw new Error('SSE content exceeds maximum size')
            }
            if (onChunk) {
              onChunk(data.content)
            }
          } else if (data.type === 'error') {
            throw new Error(data.error || 'AI generation failed')
          }
        } catch (parseError) {
          if (parseError instanceof Error && !parseError.message.includes('JSON')) {
            throw parseError
          }
          // 不完全なJSONは無視
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
      confidence: 0.85,
    }
  }

  isInitialized(): boolean {
    return this.useProxy || this.client !== null
  }

  isUsingProxy(): boolean {
    return this.useProxy
  }
}

export const aiService = new AIService()
