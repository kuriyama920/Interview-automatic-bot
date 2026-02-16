/**
 * OpenAI コンテンツ生成
 */

import OpenAI from 'openai'
import { z } from 'zod'
import { OPENAI, FEATURES, TIP_CATEGORIES, ENABLE_TRENDS } from '../config.js'
import { getPrompt } from './prompts.js'
import { fetchTrendContext } from './trends.js'
import { logger } from '../utils/logger.js'
import type { GeneratedContent, TemplateType, TrendContext } from '../types.js'

/** 生成コンテンツのバリデーションスキーマ */
const contentSchema = z.object({
  headline: z.string().max(20),
  subheadline: z.string().max(35),
  bodyText: z.array(z.string().max(30)).min(2).max(5),
  ctaText: z.string().max(20),
  hashtags: z.array(z.string()).min(3).max(8),
  description: z.string().max(150),
})

/**
 * 指定テンプレートのコンテンツをAIで生成
 */
export async function generateContent(
  templateType: TemplateType,
  featureIndex: number,
  tipIndex: number
): Promise<GeneratedContent> {
  const client = new OpenAI({ apiKey: OPENAI.apiKey() })

  // トレンドデータ取得（失敗時はnullでフォールバック）
  let trendContext: TrendContext | null = null
  if (ENABLE_TRENDS) {
    trendContext = await fetchTrendContext()
  }

  const context = buildContext(templateType, featureIndex, tipIndex, trendContext)

  logger.info(`コンテンツ生成開始: template=${templateType}`)

  const prompt = getPrompt(templateType, context)

  const response = await client.chat.completions.create({
    model: OPENAI.model,
    messages: [
      {
        role: 'system',
        content:
          'あなたはSNSマーケティングの専門家です。ショート動画用の簡潔で効果的なコピーを生成します。指定されたJSON形式のみを出力してください。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    response_format: { type: 'json_object' },
  })

  const rawContent = response.choices[0]?.message?.content
  if (!rawContent) {
    throw new Error('OpenAI からの応答が空です')
  }

  logger.debug(`OpenAI応答: ${rawContent}`)

  const parsed = JSON.parse(rawContent)
  const validated = contentSchema.parse(parsed)

  const content: GeneratedContent = {
    ...validated,
    templateType,
  }

  logger.info(`コンテンツ生成完了: headline="${content.headline}"`)

  return content
}

/**
 * テンプレートタイプに応じたベースコンテキストを構築
 */
function buildBaseContext(
  templateType: TemplateType,
  featureIndex: number,
  tipIndex: number
): Record<string, string> {
  switch (templateType) {
    case 'feature-highlight':
    case 'demo-showcase': {
      const feature = FEATURES[featureIndex % FEATURES.length]
      return {
        featureName: feature.name,
        featureDescription: feature.description,
        featureBenefit: feature.benefit,
      }
    }
    case 'stats-promo':
      return {
        stat: String(65 + Math.floor(Math.random() * 20)),
      }
    case 'tip-of-day':
      return {
        tipCategory: TIP_CATEGORIES[tipIndex % TIP_CATEGORIES.length],
      }
    case 'testimonial': {
      const scenarios = [
        'エンジニア転職のオンライン面接',
        '営業職への未経験転職の最終面接',
        '外資系企業の英語面接',
        'スタートアップの役員面接',
        '大手企業のグループ面接',
      ]
      return {
        scenario: scenarios[featureIndex % scenarios.length],
      }
    }
  }
}

/**
 * ベースコンテキストにトレンド情報を合成
 */
function buildContext(
  templateType: TemplateType,
  featureIndex: number,
  tipIndex: number,
  trendContext: TrendContext | null
): Record<string, string> {
  const base = buildBaseContext(templateType, featureIndex, tipIndex)

  if (trendContext) {
    return { ...base, trendSection: buildTrendSection(trendContext) }
  }

  return base
}

/**
 * トレンドデータをプロンプト用テキストに変換
 */
function buildTrendSection(trendContext: TrendContext): string {
  const parts: string[] = []

  if (trendContext.tiktokTrends.length > 0) {
    const tiktok = trendContext.tiktokTrends
      .map((t) => `#${t.name}${t.views ? ` (${t.views}再生)` : ''}`)
      .join(', ')
    parts.push(`TikTokトレンド: ${tiktok}`)
  }

  if (trendContext.relevantTrends.length > 0) {
    const relevant = trendContext.relevantTrends
      .map((t) => `「${t.title}」(${t.formattedTraffic})`)
      .join(', ')
    parts.push(`Google career関連トレンド: ${relevant}`)
  }

  if (trendContext.generalTrends.length > 0) {
    const general = trendContext.generalTrends.map((t) => t.title).join(', ')
    parts.push(`日本の一般トレンド: ${general}`)
  }

  return parts.join('\n')
}
