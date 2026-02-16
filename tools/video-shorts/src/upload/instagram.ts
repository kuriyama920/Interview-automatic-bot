/**
 * Instagram Graph API Reels アップロード
 *
 * Facebook OAuth 2.0 + 2ステップ公開（コンテナ作成 → 公開）
 * 注意: 動画はパブリックURLで提供する必要がある
 * https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 */

import { createReadStream, statSync } from 'fs'
import { INSTAGRAM } from '../config.js'
import { withRetry } from './retry.js'
import { logger } from '../utils/logger.js'
import type { PlatformUploader, VideoMetadata, UploadResult } from '../types.js'

const GRAPH_API = 'https://graph.facebook.com/v20.0'

/**
 * Instagram Reels アップロード
 *
 * 制限事項:
 * - 動画をパブリックURLで提供する必要がある
 * - ローカルファイルから直接アップロードするには
 *   一時的にどこかにホスティングする必要がある
 * - 現在はパブリックURL方式のみ実装
 */
async function upload(
  videoPath: string,
  metadata: VideoMetadata
): Promise<UploadResult> {
  logger.info('Instagram Reels アップロード開始')

  const accessToken = INSTAGRAM.accessToken()
  const accountId = INSTAGRAM.businessAccountId()

  // Instagram API はパブリックURLが必要
  // ローカルファイルの場合は一時ホスティングが必要
  // ここではビデオURLが環境変数で提供されることを想定
  const videoUrl = process.env.INSTAGRAM_VIDEO_URL
  if (!videoUrl) {
    logger.warn(
      'Instagram: INSTAGRAM_VIDEO_URL が未設定です。' +
        'Instagram Reels APIは動画のパブリックURLが必要です。'
    )
    return {
      platform: 'instagram',
      success: false,
      error: 'INSTAGRAM_VIDEO_URL が設定されていません。パブリックURLが必要です。',
    }
  }

  const hashtagStr = metadata.hashtags
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
  const caption = `${metadata.description}\n\n${hashtagStr}`

  // 1. Reels コンテナ作成
  const containerRes = await withRetry(
    async () => {
      const params = new URLSearchParams({
        media_type: 'REELS',
        video_url: videoUrl,
        caption,
        share_to_feed: 'true',
        access_token: accessToken,
      })

      const res = await fetch(`${GRAPH_API}/${accountId}/media?${params}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Instagram container create failed: ${res.status} ${body}`)
      }

      return res.json() as Promise<{ id: string }>
    },
    'Instagram container create'
  )

  const containerId = containerRes.id
  logger.info(`Instagram コンテナ作成完了: ${containerId}`)

  // 2. コンテナ処理完了を待つ（最大60秒）
  await waitForContainerReady(containerId, accessToken)

  // 3. 公開
  const publishRes = await withRetry(
    async () => {
      const params = new URLSearchParams({
        creation_id: containerId,
        access_token: accessToken,
      })

      const res = await fetch(`${GRAPH_API}/${accountId}/media_publish?${params}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Instagram publish failed: ${res.status} ${body}`)
      }

      return res.json() as Promise<{ id: string }>
    },
    'Instagram publish'
  )

  const mediaId = publishRes.id
  logger.info(`Instagram 投稿完了: mediaId=${mediaId}`)

  return {
    platform: 'instagram',
    success: true,
    videoId: mediaId,
  }
}

/**
 * コンテナの処理完了を待つ
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  maxWaitMs = 60000
): Promise<void> {
  const startTime = Date.now()
  const pollInterval = 3000

  while (Date.now() - startTime < maxWaitMs) {
    const params = new URLSearchParams({
      fields: 'status_code',
      access_token: accessToken,
    })

    const res = await fetch(`${GRAPH_API}/${containerId}?${params}`)
    const data = (await res.json()) as { status_code?: string }

    if (data.status_code === 'FINISHED') {
      logger.info('Instagram コンテナ処理完了')
      return
    }

    if (data.status_code === 'ERROR') {
      throw new Error('Instagram コンテナ処理でエラーが発生しました')
    }

    logger.debug(`Instagram コンテナ処理中: ${data.status_code}`)
    await new Promise((r) => setTimeout(r, pollInterval))
  }

  throw new Error('Instagram コンテナ処理がタイムアウトしました')
}

async function validateCredentials(): Promise<boolean> {
  try {
    const accessToken = INSTAGRAM.accessToken()
    const accountId = INSTAGRAM.businessAccountId()

    const params = new URLSearchParams({
      fields: 'id,username',
      access_token: accessToken,
    })

    const res = await fetch(`${GRAPH_API}/${accountId}?${params}`)
    if (!res.ok) return false

    const data = (await res.json()) as { username?: string }
    logger.info(`Instagram 認証OK: @${data.username}`)
    return true
  } catch (error) {
    logger.error(
      `Instagram 認証エラー: ${error instanceof Error ? error.message : error}`
    )
    return false
  }
}

const instagramUploader: PlatformUploader = {
  name: 'instagram',
  upload,
  validateCredentials,
}

export default instagramUploader
