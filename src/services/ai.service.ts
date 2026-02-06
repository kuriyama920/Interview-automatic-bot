import OpenAI from 'openai'
import { createLogger } from './logger.service'

const log = createLogger('ai-service')

export interface AIResponse {
  answer: string
  suggestions: string[]
  confidence: number
}

export interface AIServiceConfig {
  apiKey: string
  model?: string
  maxTokens?: number
  temperature?: number
}

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

  initialize(config: AIServiceConfig): void {
    this.config = {
      model: 'gpt-5-mini',
      maxTokens: 500,
      temperature: 0.7,
      ...config,
    }

    this.client = new OpenAI({
      apiKey: config.apiKey,
    })

    log.info('AI service initialized', { model: this.config.model })
  }

  async generateResponse(question: string, context?: string): Promise<AIResponse> {
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
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
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
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
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
    return this.client !== null
  }

  updateConfig(config: Partial<AIServiceConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config }
      log.info('AI service config updated', { model: this.config.model })
    }
  }
}

export const aiService = new AIService()
