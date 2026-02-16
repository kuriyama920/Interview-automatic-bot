/**
 * 投稿履歴管理（JSON ファイルベース）
 */

import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { logger } from '../utils/logger.js'
import type {
  HistoryRecord,
  GeneratedContent,
  UploadResult,
} from '../types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const HISTORY_FILE = resolve(__dirname, '..', '..', 'history.json')

/**
 * 履歴を取得
 */
export async function getHistory(): Promise<HistoryRecord[]> {
  if (!existsSync(HISTORY_FILE)) {
    return []
  }

  try {
    const raw = await readFile(HISTORY_FILE, 'utf-8')
    return JSON.parse(raw) as HistoryRecord[]
  } catch (error) {
    logger.warn(`履歴ファイル読み込みエラー: ${error}`)
    return []
  }
}

/**
 * 履歴に新規レコードを追加
 */
export async function addHistoryRecord(
  content: GeneratedContent,
  videoFile: string,
  uploads: UploadResult[]
): Promise<HistoryRecord> {
  const history = await getHistory()

  const record: HistoryRecord = {
    id: randomUUID(),
    date: new Date().toISOString().split('T')[0],
    templateType: content.templateType,
    videoFile,
    content,
    uploads,
    createdAt: new Date().toISOString(),
  }

  const updated = [...history, record]

  await writeFile(HISTORY_FILE, JSON.stringify(updated, null, 2), 'utf-8')
  logger.info(`履歴に追加: ${record.id} (${record.templateType})`)

  return record
}

/**
 * 直近N件の履歴を取得
 */
export async function getRecentHistory(
  count: number = 10
): Promise<HistoryRecord[]> {
  const history = await getHistory()
  return history.slice(-count)
}
