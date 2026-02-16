/**
 * コンテンツカレンダー・ローテーション管理
 */

import { DAILY_TEMPLATE_MAP, FEATURES, TIP_CATEGORIES } from '../config.js'
import { getHistory } from '../history/store.js'
import type { TemplateType } from '../types.js'

interface CalendarSelection {
  templateType: TemplateType
  featureIndex: number
  tipIndex: number
}

/**
 * 今日のテンプレートと内容を決定
 */
export async function getTodaySelection(
  overrideTemplate?: TemplateType
): Promise<CalendarSelection> {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const templateType = overrideTemplate ?? DAILY_TEMPLATE_MAP[dayOfWeek]

  const history = await getHistory()

  // 過去の投稿からインデックスを計算（重複を避けるためローテーション）
  const pastOfType = history.filter((r) => r.templateType === templateType)
  const featureIndex = pastOfType.length % FEATURES.length
  const tipIndex = pastOfType.length % TIP_CATEGORIES.length

  return {
    templateType,
    featureIndex,
    tipIndex,
  }
}

/**
 * 今後7日間のカレンダーを表示
 */
export function getUpcomingCalendar(): Array<{
  date: string
  dayOfWeek: string
  templateType: TemplateType
}> {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const calendar: Array<{
    date: string
    dayOfWeek: string
    templateType: TemplateType
  }> = []

  for (let i = 0; i < 7; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const dow = date.getDay()
    calendar.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek: days[dow],
      templateType: DAILY_TEMPLATE_MAP[dow],
    })
  }

  return calendar
}
