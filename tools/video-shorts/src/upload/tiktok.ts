/**
 * TikTok Content Posting API アップロード
 *
 * OAuth 2.0 + チャンクアップロード方式
 * https://developers.tiktok.com/doc/content-posting-api-get-started
 */

import { createReadStream, statSync } from 'fs'
import { TIKTOK } from '../config.js'
import { withRetry } from './retry.js'
import { logger } from '../utils/logger.js'
import type { PlatformUploader, VideoMetadata, UploadResult } from '../types.js'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

async function upload(
  videoPath: string,
  metadata: VideoMetadata
): Promise<UploadResult> {
  logger.info('TikTok アップロード開始')

  const accessToken = TIKTOK.accessToken()
  const fileSize = statSync(videoPath).size

  // 1. アップロード初期化（PULL方式 or PUSH方式）
  // ここではFILE_UPLOAD (PUSH) 方式を使用
  const initRes = await withRetry(
    async () => {
      const res = await fetch(`${TIKTOK_API_BASE}/post/publish/inbox/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: fileSize,
            chunk_size: fileSize, // 1チャンクで送信（64MB未満の場合）
            total_chunk_count: 1,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`TikTok init failed: ${res.status} ${body}`)
      }

      return res.json()
    },
    'TikTok upload init'
  )

  const publishId = initRes.data?.publish_id
  const uploadUrl = initRes.data?.upload_url

  if (!publishId || !uploadUrl) {
    throw new Error('TikTok: publish_id または upload_url が取得できませんでした')
  }

  logger.info(`TikTok init完了: publishId=${publishId}`)

  // 2. 動画ファイルアップロード
  await withRetry(
    async () => {
      const fileStream = createReadStream(videoPath)
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Range': `bytes 0-${fileSize - 1}/${fileSize}`,
          'Content-Type': 'video/mp4',
        },
        body: fileStream as unknown as BodyInit,
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`TikTok upload failed: ${res.status} ${body}`)
      }
    },
    'TikTok file upload'
  )

  logger.info('TikTok ファイルアップロード完了')

  // 3. 公開（タイトル・ハッシュタグ付き）
  const hashtagStr = metadata.hashtags
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
  const title = `${metadata.description} ${hashtagStr}`.slice(0, 150)

  const publishRes = await withRetry(
    async () => {
      const res = await fetch(`${TIKTOK_API_BASE}/post/publish/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify({
          post_info: {
            title,
            privacy_level: 'PUBLIC_TO_EVERYONE',
            disable_duet: false,
            disable_comment: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: uploadUrl,
          },
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        throw new Error(`TikTok publish failed: ${res.status} ${body}`)
      }

      return res.json()
    },
    'TikTok publish'
  )

  logger.info(`TikTok 投稿完了: publishId=${publishId}`)

  return {
    platform: 'tiktok',
    success: true,
    videoId: publishId,
  }
}

async function validateCredentials(): Promise<boolean> {
  try {
    const accessToken = TIKTOK.accessToken()
    const res = await fetch(`${TIKTOK_API_BASE}/user/info/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    return res.ok
  } catch (error) {
    logger.error(
      `TikTok 認証エラー: ${error instanceof Error ? error.message : error}`
    )
    return false
  }
}

const tiktokUploader: PlatformUploader = {
  name: 'tiktok',
  upload,
  validateCredentials,
}

export default tiktokUploader
