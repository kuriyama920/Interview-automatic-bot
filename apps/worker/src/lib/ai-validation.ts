/**
 * AI Validation Helpers
 *
 * /generate と /generate-v2 で共有される入力バリデーションロジック。
 * 各バリデーション関数は成功時にバリデーション済み値を、失敗時に { error } を返す。
 */

export const MAX_QUESTION_LENGTH = 2000
export const MAX_CONTEXT_LENGTH = 30000

// --- Generate constants ---
export const DEFAULT_MODEL = 'gpt-5-nano'
export const DEFAULT_MAX_TOKENS = 800
export const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-nano', 'gpt-5-mini', 'gpt-5.4-nano']
export const MODELS_WITHOUT_TEMPERATURE = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5.4-nano']
export const MODELS_WITH_REASONING = ['gpt-5-nano', 'gpt-5-mini', 'gpt-5.4-nano']

// --- Summarize constants ---
export const MAX_SUMMARY_INPUT_LENGTH = 1000
export const MAX_TURN_TEXT_LENGTH = 5000

// --- V2 constants ---
export const MAX_SPECULATIVE_TEXT_LENGTH = 2000

/** turnId のバリデーション正規表現（UUID hex形式） */
const TURN_ID_PATTERN = /^[a-f0-9-]{1,64}$/

/**
 * turnId をサニタイズ: 不正なフォーマットの場合は 'unknown' を返す
 */
export function sanitizeTurnId(raw: unknown): string {
  if (typeof raw !== 'string') return 'unknown'
  return TURN_ID_PATTERN.test(raw) ? raw : 'unknown'
}

/**
 * 質問フィールドのバリデーション
 * - 必須、string型
 * - trim後の空文字チェック
 * - 最大長チェック
 */
export function validateQuestion(
  data: Record<string, unknown>
): { question: string } | { error: string } {
  if (!data.question || typeof data.question !== 'string') {
    return { error: 'question is required and must be a string' }
  }

  const question = data.question.trim()
  if (question.length === 0) {
    return { error: 'question cannot be empty' }
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return { error: `question must be less than ${MAX_QUESTION_LENGTH} characters` }
  }

  return { question }
}

/**
 * コンテキストフィールドのバリデーション
 * - オプショナル（string以外はundefined）
 * - 最大長チェック
 */
export function validateContext(
  data: Record<string, unknown>
): { context: string | undefined } | { error: string } {
  const context = typeof data.context === 'string' ? data.context : undefined
  if (context && context.length > MAX_CONTEXT_LENGTH) {
    return { error: `context must be less than ${MAX_CONTEXT_LENGTH} characters` }
  }
  return { context }
}

/**
 * previousResponseId フィールドのバリデーション
 * - オプショナル
 * - 形式: resp_[a-zA-Z0-9_-]+、最大200文字
 */
export function validatePreviousResponseId(
  data: Record<string, unknown>
): { previousResponseId: string | undefined } {
  const previousResponseId =
    typeof data.previousResponseId === 'string'
    && data.previousResponseId.length > 0
    && data.previousResponseId.length <= 200
    && /^resp_[a-zA-Z0-9_-]+$/.test(data.previousResponseId)
      ? data.previousResponseId
      : undefined

  return { previousResponseId }
}

// --- Composite validators ---

export interface ValidatedGenerateRequest {
  question: string
  context: string | undefined
  includeDocumentContext: boolean
  model: string
  maxTokens: number
  temperature: number | undefined
  previousResponseId: string | undefined
  storeEnabled: boolean
}

export function validateGenerateRequest(body: unknown): ValidatedGenerateRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  const questionResult = validateQuestion(data)
  if ('error' in questionResult) return questionResult
  const { question } = questionResult

  const contextResult = validateContext(data)
  if ('error' in contextResult) return contextResult
  const { context } = contextResult

  const includeDocumentContext = data.includeDocumentContext !== false
  const requestedModel = typeof data.model === 'string' ? data.model : DEFAULT_MODEL
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : DEFAULT_MODEL
  const maxTokens =
    typeof data.maxTokens === 'number' && data.maxTokens > 0 && data.maxTokens <= 4000
      ? data.maxTokens
      : DEFAULT_MAX_TOKENS
  const supportsTemperature = !MODELS_WITHOUT_TEMPERATURE.includes(model)
  const temperature = supportsTemperature
    ? typeof data.temperature === 'number' && data.temperature >= 0 && data.temperature <= 2
      ? data.temperature
      : 0.7
    : undefined

  const { previousResponseId } = validatePreviousResponseId(data)
  const storeEnabled = data.storeEnabled === true

  return { question, context, includeDocumentContext, model, maxTokens, temperature, previousResponseId, storeEnabled }
}

export interface ValidatedSummarizeRequest {
  previousSummary: string
  interviewer: string
  candidate: string
}

export function validateSummarizeRequest(body: unknown): ValidatedSummarizeRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  if (!data.interviewer || typeof data.interviewer !== 'string') {
    return { error: 'interviewer is required and must be a string' }
  }
  if (!data.candidate || typeof data.candidate !== 'string') {
    return { error: 'candidate is required and must be a string' }
  }

  const interviewer = data.interviewer.trim()
  const candidate = data.candidate.trim()
  const previousSummary =
    typeof data.previousSummary === 'string' ? data.previousSummary.trim() : ''

  if (interviewer.length > MAX_TURN_TEXT_LENGTH) {
    return { error: `interviewer must be less than ${MAX_TURN_TEXT_LENGTH} characters` }
  }
  if (candidate.length > MAX_TURN_TEXT_LENGTH) {
    return { error: `candidate must be less than ${MAX_TURN_TEXT_LENGTH} characters` }
  }
  if (previousSummary.length > MAX_SUMMARY_INPUT_LENGTH) {
    return { error: `previousSummary must be less than ${MAX_SUMMARY_INPUT_LENGTH} characters` }
  }

  return { previousSummary, interviewer, candidate }
}

export interface ValidatedGenerateV2Request {
  question: string
  phase: 'speculative' | 'committed'
  context: string | undefined
  turnId: string
  previousResponseId: string | undefined
  storeEnabled: boolean
  /** D-2拡張用: Committed Lane側でSpeculativeテキストとの比較に使用予定 */
  speculativeText: string | undefined
}

// --- Embeddings constants & validation ---
const MAX_TEXTS = 20
const MAX_TEXT_LENGTH = 8000

export interface ValidatedEmbeddingsRequest {
  inputTexts: string[]
}

export function validateEmbeddingsRequest(body: unknown): ValidatedEmbeddingsRequest | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>
  const { text, texts } = data as { text?: unknown; texts?: unknown }

  if (!text && !texts) {
    return { error: 'text or texts is required' }
  }

  if (text) {
    if (typeof text !== 'string' || text.trim().length === 0) {
      return { error: 'text must be a non-empty string' }
    }
    if (text.length > MAX_TEXT_LENGTH) {
      return { error: `text must be less than ${MAX_TEXT_LENGTH} characters` }
    }
    return { inputTexts: [text] }
  }

  if (!Array.isArray(texts) || texts.length === 0) {
    return { error: 'texts must be a non-empty array' }
  }
  if (texts.length > MAX_TEXTS) {
    return { error: `texts must have at most ${MAX_TEXTS} items` }
  }
  for (const t of texts) {
    if (typeof t !== 'string' || t.trim().length === 0) {
      return { error: 'Each text must be a non-empty string' }
    }
    if (t.length > MAX_TEXT_LENGTH) {
      return { error: `Each text must be less than ${MAX_TEXT_LENGTH} characters` }
    }
  }
  return { inputTexts: texts as string[] }
}

export function validateGenerateV2Request(body: unknown): ValidatedGenerateV2Request | { error: string } {
  if (!body || typeof body !== 'object') {
    return { error: 'Request body is required' }
  }

  const data = body as Record<string, unknown>

  const questionResult = validateQuestion(data)
  if ('error' in questionResult) return questionResult
  const { question } = questionResult

  if (!data.phase || (data.phase !== 'speculative' && data.phase !== 'committed')) {
    return { error: 'phase must be "speculative" or "committed"' }
  }
  const phase = data.phase

  const contextResult = validateContext(data)
  if ('error' in contextResult) return contextResult
  const { context } = contextResult

  const turnId = sanitizeTurnId(data.turnId)

  const { previousResponseId } = validatePreviousResponseId(data)
  const storeEnabled = data.storeEnabled === true

  const speculativeText =
    typeof data.speculativeText === 'string' && data.speculativeText.length > 0
      ? data.speculativeText.substring(0, MAX_SPECULATIVE_TEXT_LENGTH)
      : undefined

  return { question, phase, context, turnId, previousResponseId, storeEnabled, speculativeText }
}
