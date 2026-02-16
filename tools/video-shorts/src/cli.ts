/**
 * CLI コマンド定義・引数パース
 */

import { parseArgs } from 'util'
import type { CliCommand, CliOptions, Platform, TemplateType } from './types.js'

const VALID_COMMANDS: CliCommand[] = [
  'generate',
  'generate-and-post',
  'calendar',
  'history',
  'status',
]

const VALID_TEMPLATES: TemplateType[] = [
  'feature-highlight',
  'demo-showcase',
  'stats-promo',
  'tip-of-day',
  'testimonial',
]

const VALID_PLATFORMS: Platform[] = [
  'youtube',
  'twitter',
  'tiktok',
  'instagram',
]

export function parseCliArgs(argv: string[]): CliOptions {
  const positional = argv.filter((a) => !a.startsWith('--'))
  const command = positional[0] as CliCommand | undefined

  if (!command || !VALID_COMMANDS.includes(command)) {
    printUsage()
    process.exit(1)
  }

  const { values } = parseArgs({
    args: argv.slice(1),
    options: {
      template: { type: 'string', short: 't' },
      platforms: { type: 'string', short: 'p' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  const template = values.template as string | undefined
  if (template && template !== 'auto' && !VALID_TEMPLATES.includes(template as TemplateType)) {
    console.error(`無効なテンプレート: ${template}`)
    console.error(`有効なテンプレート: ${VALID_TEMPLATES.join(', ')}`)
    process.exit(1)
  }

  const platformStr = values.platforms as string | undefined
  const platforms = platformStr
    ? platformStr.split(',').map((p) => {
        const trimmed = p.trim() as Platform
        if (!VALID_PLATFORMS.includes(trimmed)) {
          console.error(`無効なプラットフォーム: ${trimmed}`)
          console.error(`有効なプラットフォーム: ${VALID_PLATFORMS.join(', ')}`)
          process.exit(1)
        }
        return trimmed
      })
    : ['youtube' as Platform]

  return {
    command,
    template:
      template && template !== 'auto'
        ? (template as TemplateType)
        : undefined,
    platforms,
    dryRun: values['dry-run'] ?? false,
  }
}

function printUsage(): void {
  console.log(`
InterviewBot ショート動画ジェネレーター

使い方:
  npx tsx src/index.ts <command> [options]

コマンド:
  generate            動画を生成（アップロードなし）
  generate-and-post   動画を生成してプラットフォームに投稿
  calendar            今後7日間のコンテンツカレンダーを表示
  history             投稿履歴を表示
  status              プラットフォームAPI接続状態を確認

オプション:
  --template, -t      テンプレート指定
                      (feature-highlight, demo-showcase, stats-promo, tip-of-day, testimonial)
  --platforms, -p     投稿先（カンマ区切り）
                      (youtube, twitter, tiktok, instagram) デフォルト: youtube
  --dry-run           生成のみ、アップロードしない

例:
  npx tsx src/index.ts generate --template feature-highlight --dry-run
  npx tsx src/index.ts generate-and-post --platforms youtube,twitter
  npx tsx src/index.ts calendar
`)
}
