/**
 * 面接プロフィール管理
 * - InterviewProfile 型定義
 * - AI用テキスト整形 (formatProfileContext)
 * - 入力バリデーション (validateInterviewProfile)
 */

export interface InterviewProfile {
  fullName: string
  nameReading?: string
  currentCompany?: string
  currentPosition?: string
  previousCompanies?: string[]
  targetCompany?: string
  targetPosition?: string
  technologies?: string[]
  certifications?: string[]
  education?: string
  yearsOfExperience?: number
  additionalNotes?: string
}

const MAX_STRING_LENGTH = 200
const MAX_ARRAY_ITEMS = 20
const MAX_NOTES_LENGTH = 1000

/**
 * InterviewProfile を AI プロンプト用テキストに整形
 */
export function formatProfileContext(profile: InterviewProfile | null | undefined): string {
  if (!profile) return ''

  const lines: string[] = []

  if (profile.fullName) lines.push(`氏名: ${profile.fullName}`)
  if (profile.nameReading) lines.push(`ふりがな: ${profile.nameReading}`)

  if (profile.currentCompany || profile.currentPosition) {
    lines.push(
      `現職: ${[profile.currentCompany, profile.currentPosition].filter(Boolean).join(' / ')}`
    )
  }

  if (profile.targetCompany || profile.targetPosition) {
    lines.push(
      `志望先: ${[profile.targetCompany, profile.targetPosition].filter(Boolean).join(' / ')}`
    )
    if (profile.targetCompany) {
      lines.push(`※回答中で「御社」の代わりに「${profile.targetCompany}」を適宜使用すること`)
    }
  }

  if (profile.previousCompanies && profile.previousCompanies.length > 0) {
    lines.push(`過去の企業: ${profile.previousCompanies.join(', ')}`)
  }

  if (profile.technologies && profile.technologies.length > 0) {
    lines.push(`主要技術: ${profile.technologies.join(', ')}`)
    lines.push(`※「技術」「スキル」等の曖昧表現ではなく、${profile.technologies.slice(0, 3).join('・')}等の具体的な技術名を使うこと`)
  }

  if (profile.certifications && profile.certifications.length > 0) {
    lines.push(`資格: ${profile.certifications.join(', ')}`)
  }

  if (profile.education) lines.push(`学歴: ${profile.education}`)

  if (profile.yearsOfExperience !== undefined && profile.yearsOfExperience !== null) {
    lines.push(`経験年数: ${profile.yearsOfExperience}年`)
  }

  if (profile.additionalNotes) lines.push(`特記: ${profile.additionalNotes}`)

  return lines.join('\n')
}

/**
 * リクエストボディからInterviewProfileをバリデーション
 */
export function validateInterviewProfile(
  data: unknown
): InterviewProfile | { error: string } {
  if (!data || typeof data !== 'object') {
    return { error: 'Profile data must be an object' }
  }

  const d = data as Record<string, unknown>

  if (!d.fullName || typeof d.fullName !== 'string' || d.fullName.trim().length === 0) {
    return { error: 'fullName is required' }
  }
  if (d.fullName.length > MAX_STRING_LENGTH) {
    return { error: `fullName must be less than ${MAX_STRING_LENGTH} characters` }
  }

  const result: InterviewProfile = {
    fullName: d.fullName.trim(),
  }

  const optionalStringFields: (keyof InterviewProfile)[] = [
    'nameReading',
    'currentCompany',
    'currentPosition',
    'targetCompany',
    'targetPosition',
    'education',
  ]

  for (const field of optionalStringFields) {
    const value = d[field]
    if (value !== undefined && value !== null && value !== '') {
      if (typeof value !== 'string') {
        return { error: `${field} must be a string` }
      }
      if (value.length > MAX_STRING_LENGTH) {
        return { error: `${field} must be less than ${MAX_STRING_LENGTH} characters` }
      }
      ;(result as unknown as Record<string, unknown>)[field] = value.trim()
    }
  }

  const arrayFields: (keyof InterviewProfile)[] = [
    'previousCompanies',
    'technologies',
    'certifications',
  ]

  for (const field of arrayFields) {
    const value = d[field]
    if (value !== undefined && value !== null) {
      if (!Array.isArray(value)) {
        return { error: `${field} must be an array` }
      }
      if (value.length > MAX_ARRAY_ITEMS) {
        return { error: `${field} must have at most ${MAX_ARRAY_ITEMS} items` }
      }
      const filtered: string[] = []
      for (const item of value) {
        if (typeof item !== 'string') {
          return { error: `Each item in ${field} must be a string` }
        }
        if (item.length > MAX_STRING_LENGTH) {
          return { error: `Each item in ${field} must be less than ${MAX_STRING_LENGTH} characters` }
        }
        const trimmed = item.trim()
        if (trimmed.length > 0) {
          filtered.push(trimmed)
        }
      }
      if (filtered.length > 0) {
        ;(result as unknown as Record<string, unknown>)[field] = filtered
      }
    }
  }

  if (d.yearsOfExperience !== undefined && d.yearsOfExperience !== null) {
    if (typeof d.yearsOfExperience !== 'number' || !Number.isFinite(d.yearsOfExperience)) {
      return { error: 'yearsOfExperience must be a number' }
    }
    if (d.yearsOfExperience < 0 || d.yearsOfExperience > 60) {
      return { error: 'yearsOfExperience must be between 0 and 60' }
    }
    result.yearsOfExperience = Math.floor(d.yearsOfExperience)
  }

  if (d.additionalNotes !== undefined && d.additionalNotes !== null && d.additionalNotes !== '') {
    if (typeof d.additionalNotes !== 'string') {
      return { error: 'additionalNotes must be a string' }
    }
    if (d.additionalNotes.length > MAX_NOTES_LENGTH) {
      return { error: `additionalNotes must be less than ${MAX_NOTES_LENGTH} characters` }
    }
    result.additionalNotes = d.additionalNotes.trim()
  }

  return result
}
