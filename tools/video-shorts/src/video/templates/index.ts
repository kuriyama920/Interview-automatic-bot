/**
 * テンプレートレジストリ
 */

import type { TemplateType } from '../../types.js'

export { FeatureHighlight } from './feature-highlight.js'
export { TipOfDay } from './tip-of-day.js'
export { DemoShowcase } from './demo-showcase.js'
export { StatsPromo } from './stats-promo.js'
export { Testimonial } from './testimonial.js'

/** 登録済みテンプレート一覧 */
export const TEMPLATE_IDS: readonly TemplateType[] = [
  'feature-highlight',
  'demo-showcase',
  'stats-promo',
  'tip-of-day',
  'testimonial',
] as const

/** テンプレートID → Remotion Composition ID */
export function getCompositionId(templateType: TemplateType): string {
  return templateType
}
