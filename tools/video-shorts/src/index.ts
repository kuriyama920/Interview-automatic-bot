/**
 * ショート動画ジェネレーター CLIエントリーポイント
 */

import { parseCliArgs } from './cli.js'
import { generateContent } from './content/generator.js'
import { getTodaySelection, getUpcomingCalendar } from './content/calendar.js'
import { renderVideo } from './video/renderer.js'
import { addHistoryRecord, getRecentHistory } from './history/store.js'
import { logger } from './utils/logger.js'
import type { CliOptions, UploadResult } from './types.js'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const options = parseCliArgs(args)

  try {
    switch (options.command) {
      case 'generate':
        await handleGenerate(options)
        break
      case 'generate-and-post':
        await handleGenerateAndPost(options)
        break
      case 'calendar':
        handleCalendar()
        break
      case 'history':
        await handleHistory()
        break
      case 'status':
        await handleStatus(options)
        break
    }
  } catch (error) {
    logger.error(`実行エラー: ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}

/**
 * 動画生成のみ
 */
async function handleGenerate(options: CliOptions): Promise<void> {
  logger.info('=== 動画生成開始 ===')

  // 1. カレンダーから今日のコンテンツを決定
  const selection = await getTodaySelection(options.template)
  logger.info(
    `テンプレート: ${selection.templateType}, feature=${selection.featureIndex}, tip=${selection.tipIndex}`
  )

  // 2. AIコンテンツ生成
  logger.info('AIコンテンツ生成中...')
  const content = await generateContent(
    selection.templateType,
    selection.featureIndex,
    selection.tipIndex
  )
  logger.info(`生成完了: "${content.headline}"`)

  if (options.dryRun) {
    logger.info('=== ドライラン: 生成されたコンテンツ ===')
    console.log(JSON.stringify(content, null, 2))
    logger.info('ドライランのため動画レンダリングはスキップします')
    return
  }

  // 3. 動画レンダリング
  logger.info('動画レンダリング中...')
  const videoPath = await renderVideo(content)
  logger.info(`動画生成完了: ${videoPath}`)

  // 4. 履歴に記録
  await addHistoryRecord(content, videoPath, [])
  logger.info('=== 動画生成完了 ===')
}

/**
 * 動画生成 + プラットフォーム投稿
 */
async function handleGenerateAndPost(options: CliOptions): Promise<void> {
  logger.info('=== 動画生成 + 投稿開始 ===')

  // 1-3. 生成
  const selection = await getTodaySelection(options.template)
  const content = await generateContent(
    selection.templateType,
    selection.featureIndex,
    selection.tipIndex
  )

  let videoPath: string

  if (options.dryRun) {
    logger.info('ドライラン: レンダリング・投稿をスキップ')
    console.log(JSON.stringify(content, null, 2))
    return
  }

  videoPath = await renderVideo(content)
  logger.info(`動画生成完了: ${videoPath}`)

  // 4. プラットフォームへアップロード
  const platforms = options.platforms ?? ['youtube']
  const uploads: UploadResult[] = []

  for (const platform of platforms) {
    logger.info(`アップロード中: ${platform}`)
    try {
      // 動的にアップローダーをインポート
      const uploaderModule = await import(`./upload/${platform}.js`)
      const uploader = uploaderModule.default ?? uploaderModule
      const result = await uploader.upload(videoPath, {
        title: `${content.headline} | ${content.subheadline}`,
        description: content.description,
        tags: ['InterviewBot', '面接対策', 'AI', '転職'],
        hashtags: content.hashtags,
        templateType: content.templateType,
        language: 'ja' as const,
      })
      uploads.push(result)
      logger.info(
        `${platform} アップロード${result.success ? '成功' : '失敗'}: ${result.url ?? result.error}`
      )
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      uploads.push({
        platform,
        success: false,
        error: errorMessage,
      })
      logger.error(`${platform} アップロードエラー: ${errorMessage}`)
    }
  }

  // 5. 履歴に記録
  await addHistoryRecord(content, videoPath, uploads)

  // 結果サマリー
  const successCount = uploads.filter((u) => u.success).length
  logger.info(
    `=== 投稿完了: ${successCount}/${uploads.length} プラットフォーム成功 ===`
  )

  if (successCount < uploads.length) {
    process.exit(1)
  }
}

/**
 * カレンダー表示
 */
function handleCalendar(): void {
  const calendar = getUpcomingCalendar()
  console.log('\n今後7日間のコンテンツカレンダー:')
  console.log('─'.repeat(50))
  for (const entry of calendar) {
    const isToday =
      entry.date === new Date().toISOString().split('T')[0]
    const marker = isToday ? ' ← 今日' : ''
    console.log(
      `  ${entry.date} (${entry.dayOfWeek})  ${entry.templateType}${marker}`
    )
  }
  console.log('')
}

/**
 * 投稿履歴表示
 */
async function handleHistory(): Promise<void> {
  const history = await getRecentHistory(10)

  if (history.length === 0) {
    console.log('\n投稿履歴はありません\n')
    return
  }

  console.log('\n直近の投稿履歴:')
  console.log('─'.repeat(70))
  for (const record of history) {
    const uploadStatus = record.uploads
      .map((u) => `${u.platform}:${u.success ? 'OK' : 'NG'}`)
      .join(', ')
    console.log(
      `  ${record.date}  ${record.templateType.padEnd(20)}  ${record.content.headline}`
    )
    if (uploadStatus) {
      console.log(`${''.padEnd(12)}投稿: ${uploadStatus}`)
    }
  }
  console.log('')
}

/**
 * プラットフォームAPI接続状態確認
 */
async function handleStatus(options: CliOptions): Promise<void> {
  const platforms = options.platforms ?? [
    'youtube',
    'twitter',
    'tiktok',
    'instagram',
  ]
  console.log('\nプラットフォーム接続状態:')
  console.log('─'.repeat(40))

  for (const platform of platforms) {
    try {
      const uploaderModule = await import(`./upload/${platform}.js`)
      const uploader = uploaderModule.default ?? uploaderModule
      const isValid = await uploader.validateCredentials()
      console.log(
        `  ${platform.padEnd(12)} ${isValid ? '\u2713 接続OK' : '\u2717 認証エラー'}`
      )
    } catch {
      console.log(`  ${platform.padEnd(12)} \u2717 未設定`)
    }
  }
  console.log('')
}

main()
