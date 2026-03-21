/**
 * OpenAI Client & Embedding Generation Utility
 *
 * - Cloudflare AI Gateway経由のOpenAI接続をサポート
 * - サーバーサイドでテキストのEmbeddingを生成する
 * - モデル: text-embedding-3-small (1536次元)
 */

import OpenAI from 'openai'
import { mapOpenAIErrorToMessage } from './ai-streaming'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 20
const BATCH_DELAY_MS = 100

/**
 * OpenAIクライアントを作成
 * CF_ACCOUNT_IDとCF_AI_GATEWAY_IDが設定されていればAI Gateway経由、
 * そうでなければ直接api.openai.comへ接続
 *
 * セキュリティ: CF_ACCOUNT_ID/CF_AI_GATEWAY_IDはフォーマット検証してからURL構築に使用
 * （環境変数汚染時のSSRFリスクを軽減）
 */
export function createOpenAIClient(
  apiKey: string,
  env?: { CF_ACCOUNT_ID?: string; CF_AI_GATEWAY_ID?: string },
  timeout?: number
): OpenAI {
  const isValidAccountId = /^[a-f0-9]{32}$/.test(env?.CF_ACCOUNT_ID ?? '')
  const isValidGatewayId = /^[a-z0-9-]{1,64}$/.test(env?.CF_AI_GATEWAY_ID ?? '')

  const baseURL =
    isValidAccountId && isValidGatewayId
      ? `https://gateway.ai.cloudflare.com/v1/${env!.CF_ACCOUNT_ID}/${env!.CF_AI_GATEWAY_ID}/openai`
      : undefined

  return new OpenAI({ apiKey, baseURL, ...(timeout !== undefined && { timeout }) })
}

/**
 * OpenAI APIエラーをユーザーフレンドリーなメッセージに変換（embedding用ラッパー）
 * ストリーミング用の mapOpenAIErrorToMessage を統一的に使用
 */
function handleOpenAIError(error: unknown): never {
  throw new Error(mapOpenAIErrorToMessage(error))
}

/**
 * 単一テキストのEmbeddingを生成
 * clientパラメータが渡された場合はそれを使用し、新しいクライアントの作成を回避する
 */
export async function generateEmbedding(
  text: string,
  apiKey: string,
  env?: { CF_ACCOUNT_ID?: string; CF_AI_GATEWAY_ID?: string },
  client?: OpenAI
): Promise<number[]> {
  const openai = client ?? createOpenAIClient(apiKey, env)

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    })

    return response.data[0].embedding
  } catch (error) {
    handleOpenAIError(error)
  }
}

/**
 * 複数テキストのEmbeddingをバッチ生成
 * clientパラメータが渡された場合はそれを使用し、新しいクライアントの作成を回避する
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
  env?: { CF_ACCOUNT_ID?: string; CF_AI_GATEWAY_ID?: string },
  client?: OpenAI
): Promise<number[][]> {
  const openai = client ?? createOpenAIClient(apiKey, env)
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      })

      embeddings.push(...response.data.map((d) => d.embedding))
    } catch (error) {
      handleOpenAIError(error)
    }

    // レート制限対策: バッチ間にディレイを入れる
    if (i + BATCH_SIZE < texts.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return embeddings
}
