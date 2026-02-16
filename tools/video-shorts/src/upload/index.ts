/**
 * アップロードオーケストレーター
 */

import { logger } from '../utils/logger.js'
import type { Platform, VideoMetadata, UploadResult } from '../types.js'

/** プラットフォーム別アップローダーを動的ロード */
async function loadUploader(platform: Platform) {
  try {
    const mod = await import(`./${platform}.js`)
    return mod.default ?? mod
  } catch (error) {
    throw new Error(
      `プラットフォーム ${platform} のアップローダーが見つかりません: ${error instanceof Error ? error.message : error}`
    )
  }
}

/**
 * 複数プラットフォームに並列アップロード
 */
export async function uploadToAllPlatforms(
  videoPath: string,
  metadata: VideoMetadata,
  platforms: Platform[]
): Promise<UploadResult[]> {
  logger.info(`アップロード開始: ${platforms.join(', ')}`)

  const results = await Promise.allSettled(
    platforms.map(async (platform) => {
      const uploader = await loadUploader(platform)
      return uploader.upload(videoPath, metadata) as Promise<UploadResult>
    })
  )

  return results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    return {
      platform: platforms[i],
      success: false,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    }
  })
}

/**
 * 全プラットフォームの認証状態を確認
 */
export async function checkAllPlatforms(
  platforms: Platform[]
): Promise<Record<Platform, boolean>> {
  const statuses: Record<string, boolean> = {}

  for (const platform of platforms) {
    try {
      const uploader = await loadUploader(platform)
      statuses[platform] = await uploader.validateCredentials()
    } catch {
      statuses[platform] = false
    }
  }

  return statuses as Record<Platform, boolean>
}
