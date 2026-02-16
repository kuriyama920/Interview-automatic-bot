/**
 * トレンドデータ取得（Google Trends + TikTok Trends）
 *
 * 両ソースを並列取得し、career/interview関連をフィルタリングして返す。
 * 各ソースは独立して失敗可能（graceful degradation）。
 */

import { logger } from '../utils/logger.js'
import { TREND_KEYWORDS, APIFY } from '../config.js'
import type { TrendContext, TrendItem, TikTokTrendItem } from '../types.js'

/** google-trends-api の生レスポンス項目の型 */
interface RawTrendItem {
  title?: { query: string }
  formattedTraffic?: string
  relatedQueries?: Array<{ query: string }>
}

/** Apify TikTok Trends Scraper の生レスポンス項目の型 */
interface RawTikTokTrendItem {
  name?: string
  title?: string
  hashtag?: string
  views?: string | number
  viewCount?: string | number
  category?: string
}

/** API呼び出しのタイムアウト（ms） */
const TREND_TIMEOUT_MS = 10_000
const TIKTOK_TIMEOUT_MS = 30_000

/** CJS モジュールの Promise-based singleton（イミュータブル） */
let googleTrendsPromise: Promise<typeof import('google-trends-api')> | null =
  null

/**
 * google-trends-api を動的インポート（CJS→ESM interop）
 */
function getGoogleTrends(): Promise<typeof import('google-trends-api')> {
  if (!googleTrendsPromise) {
    googleTrendsPromise = import('google-trends-api').then(
      (mod) => mod.default ?? mod
    )
  }
  return googleTrendsPromise
}

/**
 * Promise にタイムアウトを付与
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

/**
 * Google Trends + TikTok Trends を並列取得して統合
 * 各ソースは独立して失敗可能、全失敗時はnullを返す
 */
export async function fetchTrendContext(): Promise<TrendContext | null> {
  const [googleResult, tiktokResult] = await Promise.all([
    fetchGoogleTrends(),
    fetchTikTokTrends(),
  ])

  // 両方失敗時はnull
  if (!googleResult && tiktokResult.length === 0) {
    logger.warn('全トレンドソースが失敗しました（フォールバック使用）')
    return null
  }

  const context: TrendContext = {
    fetchedAt: new Date().toISOString(),
    relevantTrends: googleResult?.relevant ?? [],
    generalTrends: googleResult?.general ?? [],
    tiktokTrends: tiktokResult,
    hasTrends:
      (googleResult?.relevant?.length ?? 0) > 0 ||
      (googleResult?.general?.length ?? 0) > 0 ||
      tiktokResult.length > 0,
  }

  logger.info(
    `トレンド統合完了: Google関連=${context.relevantTrends.length}件, ` +
      `Google一般=${context.generalTrends.length}件, ` +
      `TikTok=${context.tiktokTrends.length}件`
  )

  return context
}

// ─── Google Trends ──────────────────────────────────────────

interface GoogleTrendsResult {
  readonly relevant: readonly TrendItem[]
  readonly general: readonly TrendItem[]
}

/**
 * 日本のデイリートレンドを取得してフィルタリング
 */
async function fetchGoogleTrends(): Promise<GoogleTrendsResult | null> {
  try {
    logger.info('Google Trends データ取得開始 (geo=JP)')

    const trends = await getGoogleTrends()
    const rawResult = await withTimeout(
      trends.dailyTrends({ geo: 'JP', hl: 'ja' }),
      TREND_TIMEOUT_MS
    )

    const parsed = JSON.parse(rawResult)
    const trendingDays = parsed?.default?.trendingSearchesDays

    if (!trendingDays || trendingDays.length === 0) {
      logger.warn('Google Trends: データが空です')
      return null
    }

    const todayTrends = trendingDays[0]
    const allTrending: TrendItem[] = todayTrends.trendingSearches.map(
      (item: RawTrendItem) => ({
        title: item.title?.query ?? '',
        formattedTraffic: item.formattedTraffic ?? '',
        relatedQueries:
          item.relatedQueries?.map((q: { query: string }) => q.query) ?? [],
      })
    )

    const relevant = filterRelevantTrends(allTrending).slice(0, 3)
    const general = allTrending.slice(0, 5)

    logger.info(
      `Google Trends 取得完了: 関連=${relevant.length}件, 一般=${general.length}件`
    )

    return { relevant, general }
  } catch (error) {
    logger.warn(
      `Google Trends 取得失敗: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

// ─── TikTok Trends (Apify) ─────────────────────────────────

/**
 * Apify TikTok Trends Scraper からトレンドハッシュタグを取得
 * APIFY_API_TOKEN が未設定の場合はスキップ
 */
async function fetchTikTokTrends(): Promise<readonly TikTokTrendItem[]> {
  if (!APIFY.apiToken) {
    logger.info('TikTok Trends: APIFY_API_TOKEN 未設定のためスキップ')
    return []
  }

  try {
    logger.info('TikTok Trends データ取得開始 (Apify)')

    const actorId = encodeURIComponent(APIFY.tiktokTrendsActorId)
    const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY.apiToken}`

    const response = await withTimeout(
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxItems: 10,
        }),
      }),
      TIKTOK_TIMEOUT_MS
    )

    if (!response.ok) {
      throw new Error(`Apify API error: ${response.status} ${response.statusText}`)
    }

    const rawItems: RawTikTokTrendItem[] = await response.json()

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      logger.warn('TikTok Trends: データが空です')
      return []
    }

    const tiktokTrends: TikTokTrendItem[] = rawItems
      .slice(0, 5)
      .map((item) => ({
        name: item.name ?? item.title ?? item.hashtag ?? '',
        views: String(item.views ?? item.viewCount ?? ''),
        category: item.category ?? '',
      }))
      .filter((item) => item.name !== '')

    logger.info(`TikTok Trends 取得完了: ${tiktokTrends.length}件`)

    return tiktokTrends
  } catch (error) {
    logger.warn(
      `TikTok Trends 取得失敗: ${error instanceof Error ? error.message : String(error)}`
    )
    return []
  }
}

// ─── フィルタリング ─────────────────────────────────────────

/**
 * career/interview関連キーワードでフィルタリング
 */
function filterRelevantTrends(trends: readonly TrendItem[]): TrendItem[] {
  return trends.filter((trend) => {
    const searchText = [trend.title, ...trend.relatedQueries]
      .join(' ')
      .toLowerCase()

    return TREND_KEYWORDS.some((keyword) =>
      searchText.includes(keyword.toLowerCase())
    )
  })
}
