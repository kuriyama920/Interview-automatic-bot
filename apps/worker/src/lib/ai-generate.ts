/**
 * AI Generate Helpers
 *
 * /generate と /generate-v2 で共有されるドキュメントグルーピング・DB書き込みロジック。
 */

/** ドキュメントタイプの日本語ラベルマップ */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  resume: '履歴書',
  job_posting: '求人票',
  expected_qa: '想定質問',
}

/** ドキュメントチャンクをグループ化するための入力アイテム */
export interface GroupableChunk {
  key: string
  type: string
  name: string
  content: string
}

/**
 * ドキュメントチャンクをキーごとにグループ化し、ラベル付きで返す。
 * fetchDocumentContextInner と /prefetch-context の両方で使用。
 */
export function groupDocumentChunks(
  items: GroupableChunk[]
): Map<string, { label: string; chunks: string[] }> {
  const grouped = new Map<string, { label: string; chunks: string[] }>()

  for (const item of items) {
    if (!grouped.has(item.key)) {
      const label = DOCUMENT_TYPE_LABELS[item.type] || item.type
      grouped.set(item.key, { label: `${label}: ${item.name}`, chunks: [] })
    }
    grouped.get(item.key)!.chunks.push(item.content)
  }

  return grouped
}

/**
 * グループ化されたドキュメントチャンクを整形済みテキストに変換。
 * オプションで最大長制限を適用。
 */
export function formatGroupedContext(
  grouped: Map<string, { label: string; chunks: string[] }>,
  maxLength?: number
): string {
  if (grouped.size === 0) return ''

  const text = Array.from(grouped.values())
    .map((g) => `【${g.label}】\n${g.chunks.join('\n')}`)
    .join('\n\n')

  return maxLength ? text.slice(0, maxLength) : text
}

/** deferDbWrite のオプション */
export interface DeferDbWriteOptions {
  adjustReservedUsage: (reserved: number, actual: number) => Promise<void>
  recordUsage: (amount: number, metadata: Record<string, unknown>) => Promise<void>
  reservedAmount: number
  actualAmount: number
  metadata: Record<string, unknown>
  ctx?: ExecutionContext
}

/**
 * adjustReservedUsage → recordUsage の waitUntil パターンを共通化。
 * ctx が提供された場合は waitUntil で非同期化し、ない場合は直接 await する。
 */
export function deferDbWrite(options: DeferDbWriteOptions): Promise<void> | void {
  const { adjustReservedUsage, recordUsage, reservedAmount, actualAmount, metadata, ctx } = options

  const promise = (async () => {
    await adjustReservedUsage(reservedAmount, actualAmount)
    if (actualAmount > 0) {
      await recordUsage(actualAmount, metadata)
    }
  })()

  if (ctx) {
    ctx.waitUntil(promise)
    return
  }
  return promise
}
