/**
 * X (Twitter) API v2 動画アップロード
 *
 * OAuth 1.0a でメディアアップロード + ツイート投稿
 */

import { TwitterApi } from 'twitter-api-v2'
import { TWITTER } from '../config.js'
import { withRetry } from './retry.js'
import { logger } from '../utils/logger.js'
import type { PlatformUploader, VideoMetadata, UploadResult } from '../types.js'

function createClient(): TwitterApi {
  return new TwitterApi({
    appKey: TWITTER.apiKey(),
    appSecret: TWITTER.apiSecret(),
    accessToken: TWITTER.accessToken(),
    accessSecret: TWITTER.accessTokenSecret(),
  })
}

async function upload(
  videoPath: string,
  metadata: VideoMetadata
): Promise<UploadResult> {
  logger.info('X (Twitter) アップロード開始')

  const client = createClient()

  // 1. メディアアップロード（チャンク転送）
  const mediaId = await withRetry(
    async () => {
      return client.v1.uploadMedia(videoPath, {
        mimeType: 'video/mp4',
        target: 'tweet',
      })
    },
    'Twitter media upload'
  )

  logger.info(`メディアアップロード完了: mediaId=${mediaId}`)

  // 2. ツイート投稿
  const hashtagStr = metadata.hashtags
    .slice(0, 5) // X はハッシュタグ多すぎるとスパム判定
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')

  const tweetText = `${metadata.description}\n\n${hashtagStr}`.slice(0, 280)

  const tweet = await withRetry(
    async () => {
      return client.v2.tweet({
        text: tweetText,
        media: { media_ids: [mediaId] },
      })
    },
    'Twitter tweet'
  )

  const tweetId = tweet.data.id
  // X のユーザー名は不明なのでIDベースのURLを返す
  const url = `https://x.com/i/status/${tweetId}`

  logger.info(`X (Twitter) 投稿完了: ${url}`)

  return {
    platform: 'twitter',
    success: true,
    videoId: tweetId,
    url,
  }
}

async function validateCredentials(): Promise<boolean> {
  try {
    const client = createClient()
    const me = await client.v2.me()
    logger.info(`X 認証OK: @${me.data.username}`)
    return true
  } catch (error) {
    logger.error(
      `X 認証エラー: ${error instanceof Error ? error.message : error}`
    )
    return false
  }
}

const twitterUploader: PlatformUploader = {
  name: 'twitter',
  upload,
  validateCredentials,
}

export default twitterUploader
