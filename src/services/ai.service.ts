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
const SYSTEM_PROMPT = `あなたは面接支援AIアシスタントです。面接官の質問に対して、候補者が答えるべき最適な回答を提案します。

以下のガイドラインに従ってください：
1. 簡潔で明確な回答を提供する
2. STAR法（Situation, Task, Action, Result）を意識した構造的な回答
3. 具体的なエピソードや数値を含める提案
4. ポジティブな表現を使用
5. 日本語で回答する

回答形式：
- メインの回答（2-3文）
- 補足ポイント（箇条書き2-3個）`

export class AIService {
  private client: OpenAI | null = null
  private config: AIServiceConfig | null = null
  private useProxy = false
  private apiBaseUrl = ''

  initialize(config: AIServiceConfig): void {
    this.useProxy = config.useProxy ?? !config.apiKey
    this.apiBaseUrl = config.apiBaseUrl || ''

    this.config = {
      model: 'gpt-5-mini',
      maxTokens: 500,
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
    onChunk?: (chunk: string) => void
  ): Promise<AIResponse> {
    if (this.useProxy) {
      return this.generateStreamViaProxy(question, context, onChunk)
    }

    if (!this.client || !this.config) {
      throw new Error('AI service not initialized')
    }

    log.debug('Generating stream response for question', { questionLength: question.length })

    const userMessage = context
      ? `コンテキスト情報:\n${context}\n\n面接官の質問: ${question}`
      : `面接官の質問: ${question}`

    try {
      const stream = await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_completion_tokens: this.config.maxTokens,
        stream: true,
      })

      let fullContent = ''

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || ''
        fullContent += content
        if (onChunk && content) {
          onChunk(content)
        }
      }

      log.info('AI stream response completed', { responseLength: fullContent.length })

      return this.parseResponse(fullContent)
    } catch (error) {
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
    onChunk?: (chunk: string) => void
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
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'AI generation failed')
    }

    const fullContent = await this.parseSSEResponse(response, onChunk)
    log.info('AI proxy stream response completed', { responseLength: fullContent.length })

    return this.parseResponse(fullContent)
  }

  /**
   * SSE レスポンスをパース
   */
  private async parseSSEResponse(
    response: Response,
    onChunk?: (chunk: string) => void
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
    } finally {
      reader.releaseLock()
    }

    return fullContent
  }

  private parseResponse(content: string): AIResponse {
    const lines = content.split('\n').filter((line) => line.trim())

    const mainAnswer = lines
      .filter((line) => !line.startsWith('-') && !line.startsWith('•'))
      .join(' ')
      .trim()

    const suggestions = lines
      .filter((line) => line.startsWith('-') || line.startsWith('•'))
      .map((line) => line.replace(/^[-•]\s*/, '').trim())
      .slice(0, 5)

    return {
      answer: mainAnswer || content,
      suggestions: suggestions.length > 0 ? suggestions : [],
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
