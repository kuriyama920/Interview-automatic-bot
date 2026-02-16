/**
 * 指数バックオフリトライロジック
 */

import { logger } from '../utils/logger.js'

interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryableStatusCodes: number[]
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatusCodes: [429, 500, 502, 503, 504],
}

/**
 * 指数バックオフ + ジッターでリトライ
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  label: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const isLastAttempt = attempt === cfg.maxRetries

      if (isLastAttempt) {
        logger.error(`${label}: 最大リトライ回数(${cfg.maxRetries})に到達`)
        throw error
      }

      // リトライ可能なエラーか判定
      const statusCode = getStatusCode(error)
      if (statusCode && !cfg.retryableStatusCodes.includes(statusCode)) {
        logger.error(`${label}: リトライ不可能なステータス: ${statusCode}`)
        throw error
      }

      // 指数バックオフ + ジッター
      const baseDelay = cfg.baseDelayMs * Math.pow(2, attempt)
      const jitter = Math.random() * cfg.baseDelayMs
      const delay = Math.min(baseDelay + jitter, cfg.maxDelayMs)

      logger.warn(
        `${label}: リトライ ${attempt + 1}/${cfg.maxRetries} (${Math.round(delay)}ms後)`
      )

      await sleep(delay)
    }
  }

  // TypeScript用（到達しない）
  throw new Error('Unreachable')
}

function getStatusCode(error: unknown): number | null {
  if (error && typeof error === 'object') {
    if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
      return (error as Record<string, number>).status
    }
    if ('code' in error && typeof (error as Record<string, unknown>).code === 'number') {
      return (error as Record<string, number>).code
    }
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
