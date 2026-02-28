/**
 * ドキュメントコンテキスト事前取得フック（案3）
 *
 * 録音開始時にドキュメント（履歴書・求人票）のチャンクを全量取得してキャッシュ。
 * 以降のAI生成リクエストでは、サーバーサイドRAG（Embedding+pgvector検索）を
 * スキップし、キャッシュ済みコンテキストを直接送信。
 *
 * 効果: AI生成リクエストあたり -300〜600ms（Embedding生成+検索の省略）
 */

import { useRef, useCallback } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('useDocumentContextCache')

export function useDocumentContextCache() {
  const cachedContextRef = useRef('')

  const prefetch = useCallback(async () => {
    try {
      log.info('Prefetching document context')
      const result = await window.electron.ai.prefetchContext()
      if (result.success && result.context) {
        cachedContextRef.current = result.context
        log.info('Document context cached', { length: result.context.length })
      } else {
        cachedContextRef.current = ''
        log.warn('Prefetch returned empty', { error: result.error })
      }
    } catch (error) {
      cachedContextRef.current = ''
      log.warn('Document context prefetch failed (non-blocking)', { error: String(error) })
    }
  }, [])

  const clear = useCallback(() => {
    cachedContextRef.current = ''
    log.debug('Document context cache cleared')
  }, [])

  return {
    cachedContextRef,
    prefetch,
    clear,
  }
}
