/**
 * Remotion SSR レンダラー
 *
 * bundle() → selectComposition() → renderMedia() の流れで動画を生成
 */

import { bundle } from '@remotion/bundler'
import { renderMedia, selectComposition } from '@remotion/renderer'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync, existsSync } from 'fs'
import { VIDEO_CONFIG, OUTPUT_DIR } from '../config.js'
import { logger } from '../utils/logger.js'
import type { GeneratedContent, VideoTemplateProps } from '../types.js'
import { getCompositionId } from './templates/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 動画をレンダリングしてファイルパスを返す
 */
export async function renderVideo(
  content: GeneratedContent,
  outputFileName?: string
): Promise<string> {
  const compositionId = getCompositionId(content.templateType)
  const fileName = outputFileName ?? `${content.templateType}-${Date.now()}.mp4`
  const outputPath = resolve(OUTPUT_DIR, fileName)

  // 出力ディレクトリ作成
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  logger.info(`動画レンダリング開始: composition=${compositionId}`)
  logger.info(`出力先: ${outputPath}`)

  // Remotion バンドル作成
  const entryPoint = resolve(__dirname, '..', '..', 'compositions', 'index.tsx')
  logger.info(`バンドル作成中: ${entryPoint}`)

  const bundleLocation = await bundle({
    entryPoint,
    onProgress: (progress) => {
      if (progress % 25 === 0) {
        logger.debug(`バンドル進捗: ${progress}%`)
      }
    },
  })

  logger.info('バンドル作成完了')

  // テンプレートProps構築
  const inputProps: VideoTemplateProps = {
    headline: content.headline,
    subheadline: content.subheadline,
    bodyText: content.bodyText,
    ctaText: content.ctaText,
    templateType: content.templateType,
    metadata: {},
  }

  // コンポジション選択
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  })

  logger.info(
    `コンポジション: ${composition.id} (${composition.width}x${composition.height}, ${composition.durationInFrames}f @ ${composition.fps}fps)`
  )

  // レンダリング実行
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: outputPath,
    inputProps,
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100)
      if (percent % 10 === 0) {
        logger.info(`レンダリング進捗: ${percent}%`)
      }
    },
  })

  logger.info(`動画レンダリング完了: ${outputPath}`)

  return outputPath
}
