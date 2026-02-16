/**
 * AIコンテンツ生成用プロンプトテンプレート
 */

import type { TemplateType } from '../types.js'

/** トレンドコンテキストセクション（存在する場合のみ） */
function buildTrendPromptSection(context: Record<string, string>): string {
  if (!context.trendSection) {
    return ''
  }

  return `
時事トレンド情報（可能であれば自然に取り入れてください。無理に使う必要はありません）:
${context.trendSection}
- TikTokで流行っているハッシュタグやテーマを優先的に取り入れてください
- トレンドに関連する話題でタイムリーで共感されやすいコンテンツにしてください
- ハッシュタグにはTikTokトレンドのタグを含めるとリーチが広がります
- ただし、InterviewBotの機能紹介が主目的であることを忘れないでください
`
}

/** 共通の制約 */
const COMMON_CONSTRAINTS = `
制約:
- モバイル画面で読みやすい短い文
- 面接に不安を感じている転職活動者がターゲット
- 日本語で、カジュアルすぎず堅すぎない親しみやすいトーン
- 絵文字は使わない（動画テンプレート側で追加する）
- 誇大広告や保証する表現は避ける
`

/** 出力フォーマット */
const OUTPUT_FORMAT = `
以下のJSON形式で出力してください（JSON以外のテキストは含めないでください）:
{
  "headline": "注目を引くヘッドライン（15文字以内）",
  "subheadline": "補足説明（25文字以内）",
  "bodyText": ["ポイント1（20文字以内）", "ポイント2（20文字以内）", "ポイント3（20文字以内）"],
  "ctaText": "行動を促すテキスト（15文字以内）",
  "hashtags": ["面接対策", "転職", "AI", ...他2-3個],
  "description": "SNS投稿用の説明文（100文字以内、ハッシュタグ含まない）"
}
`

export function getPrompt(
  templateType: TemplateType,
  context: Record<string, string>
): string {
  const promptMap: Record<TemplateType, string> = {
    'feature-highlight': buildFeatureHighlightPrompt(context),
    'demo-showcase': buildDemoShowcasePrompt(context),
    'stats-promo': buildStatsPromoPrompt(context),
    'tip-of-day': buildTipOfDayPrompt(context),
    testimonial: buildTestimonialPrompt(context),
  }

  return promptMap[templateType]
}

function buildFeatureHighlightPrompt(context: Record<string, string>): string {
  return `InterviewBotの以下の機能について、9:16縦型ショート動画用のコンテンツを生成してください。

機能名: ${context.featureName}
機能詳細: ${context.featureDescription}
ユーザーメリット: ${context.featureBenefit}
${buildTrendPromptSection(context)}
動画の流れ:
1. フック: 面接で困った経験に共感を誘うヘッドライン
2. 問題提示: この機能がない場合の困りごと
3. 解決策: InterviewBotのこの機能がどう解決するか（3ポイント）
4. CTA: アプリのダウンロードを促す

${COMMON_CONSTRAINTS}
${OUTPUT_FORMAT}`
}

function buildDemoShowcasePrompt(context: Record<string, string>): string {
  return `InterviewBotのデモンストレーション動画用コンテンツを生成してください。

紹介する機能: ${context.featureName}
機能の概要: ${context.featureDescription}
${buildTrendPromptSection(context)}
動画の流れ:
1. フック: 「こんなツールがあったら...」という問いかけ
2. 問題提示: 面接準備や面接中の具体的な悩み
3. 解決策: InterviewBotの操作イメージを文字で説明（3ステップ）
4. CTA: 無料で試せることを強調

${COMMON_CONSTRAINTS}
${OUTPUT_FORMAT}`
}

function buildStatsPromoPrompt(context: Record<string, string>): string {
  return `InterviewBotの実績・統計をアピールするショート動画用コンテンツを生成してください。

注意: 実際のユーザー数や成功率は不明なため、機能の具体的な数値（対応言語数、応答速度等）や一般的な転職市場の統計を使ってください。捏造された利用者数は使わないでください。

アピールポイント例:
- リアルタイム文字起こし精度
- AI応答速度（数秒で回答提案）
- 対応する面接形式（オンライン/対面）
- 面接準備にかかる時間の短縮
- 一般統計: 転職者の${context.stat ?? '70'}%が面接に不安を感じている
${buildTrendPromptSection(context)}
動画の流れ:
1. フック: 印象的な数字で注目を引く
2. 問題提示: 面接に関する一般的な課題の数値化
3. 解決策: InterviewBotがどう数値を改善するか（3ポイント）
4. CTA: 今すぐ試してみよう

${COMMON_CONSTRAINTS}
${OUTPUT_FORMAT}`
}

function buildTipOfDayPrompt(context: Record<string, string>): string {
  return `面接アドバイスのショート動画用コンテンツを生成してください。

カテゴリ: ${context.tipCategory}
${buildTrendPromptSection(context)}
動画の流れ:
1. フック: 「知ってた？」「実は...」系の意外性のあるヘッドライン
2. 問題提示: このカテゴリでよくある失敗
3. アドバイス: 具体的で実践的なTips（3ポイント）
4. CTA: InterviewBotならAIがリアルタイムでサポート

${COMMON_CONSTRAINTS}
${OUTPUT_FORMAT}`
}

function buildTestimonialPrompt(context: Record<string, string>): string {
  return `InterviewBotの利用イメージを伝えるショート動画用コンテンツを生成してください。

注意: 架空のレビューではなく、「こんな使い方ができる」という利用シナリオを提示してください。

シナリオ例: ${context.scenario ?? 'エンジニア転職面接でのオンライン面接'}
${buildTrendPromptSection(context)}
動画の流れ:
1. フック: 共感を呼ぶ面接前の不安な気持ち
2. 問題提示: 面接で実際に起こりがちな困りごと
3. 解決策: InterviewBotを使った場合のポジティブな体験（3ポイント）
4. CTA: あなたも体験してみよう

${COMMON_CONSTRAINTS}
${OUTPUT_FORMAT}`
}
