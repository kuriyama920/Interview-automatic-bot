/**
 * OpenAI Embedding Generation Utility
 *
 * サーバーサイドでテキストのEmbeddingを生成する
 * モデル: text-embedding-3-small (1536次元)
 */

import OpenAI from 'openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const BATCH_SIZE = 20
const BATCH_DELAY_MS = 100

/**
 * OpenAI APIエラーをユーザーフレンドリーなメッセージに変換
 */
function handleOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      throw new Error('OpenAI APIレート制限に達しました。しばらく待ってから再試行してください。')
    }
    if (error.status === 401) {
      throw new Error('OpenAI API認証エラー。APIキーを確認してください。')
    }
    if (error.status === 500 || error.status === 503) {
      throw new Error('OpenAI APIサーバーエラー。しばらく待ってから再試行してください。')
    }
    throw new Error(`OpenAI APIエラー: ${error.message}`)
  }
  if (error instanceof Error) {
    if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      throw new Error('OpenAI APIに接続できません。ネットワーク接続を確認してください。')
    }
    throw new Error(`Embedding生成エラー: ${error.message}`)
  }
  throw new Error('Embedding生成中に予期しないエラーが発生しました')
}

/**
 * 単一テキストのEmbeddingを生成
 */
export async function generateEmbedding(text: string, apiKey: string): Promise<number[]> {
  const client = new OpenAI({ apiKey })

  try {
    const response = await client.embeddings.create({
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
 */
export async function generateEmbeddings(texts: string[], apiKey: string): Promise<number[][]> {
  const client = new OpenAI({ apiKey })
  const embeddings: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)

    try {
      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
      })

      embeddings.push(...response.data.map((d) => d.embedding))
    } catch (error) {
      handleOpenAIError(error)
    }

    // レート制限対策: バッチ間にディレイを入れる
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS))
    }
  }

  return embeddings
}
