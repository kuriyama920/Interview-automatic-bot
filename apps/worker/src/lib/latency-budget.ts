/** RAG の「優先締め切り」（ms）
 * 400ms を超えたら RAG なしで生成開始
 * prefetch キャッシュが有効な場合は実際にはタイムアウトしない
 */
export const RAG_SOFT_DEADLINE_MS = 400

/**
 * ソフトデッドライン付きPromise
 * deadlineMs を超えたら fallback 値で解決（エラーではない）
 * 元のPromiseはキャンセルされずに継続するが、結果は無視される
 * タイマーは Promise 解決後にクリーンアップされる
 */
export function withSoftDeadline<T>(
  promise: Promise<T>,
  fallback: T,
  deadlineMs: number
): Promise<T> {
  // Absorb rejections from the original promise so they don't become
  // unhandled when the deadline timer wins the race (or vice-versa).
  // エラーはサイレントに fallback へ変換するが、デバッグのためログを残す
  const safe = promise.catch((err) => {
    console.warn('[withSoftDeadline] Promise rejected, using fallback:', err instanceof Error ? err.message : String(err))
    return fallback
  })

  let timer: ReturnType<typeof setTimeout>
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), deadlineMs)
  })

  return Promise.race([safe, deadline]).finally(() => clearTimeout(timer))
}
