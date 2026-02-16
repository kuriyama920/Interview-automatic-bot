/**
 * YouTube Data API v3 アップロード
 *
 * OAuth 2.0 リフレッシュトークンで認証し、動画をYouTube Shortsとしてアップロード
 */

import { google } from 'googleapis'
import { createReadStream } from 'fs'
import { YOUTUBE } from '../config.js'
import { withRetry } from './retry.js'
import { logger } from '../utils/logger.js'
import type { PlatformUploader, VideoMetadata, UploadResult } from '../types.js'

function createAuth() {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE.clientId(),
    YOUTUBE.clientSecret()
  )
  oauth2Client.setCredentials({
    refresh_token: YOUTUBE.refreshToken(),
  })
  return oauth2Client
}

async function upload(
  videoPath: string,
  metadata: VideoMetadata
): Promise<UploadResult> {
  logger.info('YouTube アップロード開始')

  const auth = createAuth()
  const youtube = google.youtube({ version: 'v3', auth })

  // タイトルにハッシュタグを含めない（descriptionに入れる）
  const title = metadata.title.slice(0, 100)
  const hashtagStr = metadata.hashtags
    .map((h) => (h.startsWith('#') ? h : `#${h}`))
    .join(' ')
  const description = `${metadata.description}\n\n${hashtagStr}\n\n#Shorts`

  const result = await withRetry(
    async () => {
      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title,
            description,
            tags: metadata.tags,
            categoryId: '28', // Science & Technology
            defaultLanguage: 'ja',
            defaultAudioLanguage: 'ja',
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: createReadStream(videoPath),
        },
      })

      return res.data
    },
    'YouTube upload'
  )

  const videoId = result.id
  const url = videoId ? `https://youtube.com/shorts/${videoId}` : undefined

  logger.info(`YouTube アップロード完了: ${url}`)

  return {
    platform: 'youtube',
    success: true,
    videoId: videoId ?? undefined,
    url,
  }
}

async function validateCredentials(): Promise<boolean> {
  try {
    const auth = createAuth()
    const youtube = google.youtube({ version: 'v3', auth })
    const res = await youtube.channels.list({
      part: ['id'],
      mine: true,
    })
    return (res.data.items?.length ?? 0) > 0
  } catch (error) {
    logger.error(
      `YouTube 認証エラー: ${error instanceof Error ? error.message : error}`
    )
    return false
  }
}

const youtubeUploader: PlatformUploader = {
  name: 'youtube',
  upload,
  validateCredentials,
}

export default youtubeUploader
