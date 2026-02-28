import { describe, it, expect } from 'vitest'
import {
  formatProfileContext,
  validateInterviewProfile,
  type InterviewProfile,
} from '../../src/lib/profile'

describe('formatProfileContext', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatProfileContext(null)).toBe('')
    expect(formatProfileContext(undefined)).toBe('')
  })

  it('formats full profile', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      nameReading: 'たなかたろう',
      currentCompany: 'ABC株式会社',
      currentPosition: 'シニアエンジニア',
      targetCompany: 'XYZ株式会社',
      targetPosition: 'テックリード',
      previousCompanies: ['DEF Inc.', 'GHI Corp.'],
      technologies: ['TypeScript', 'React', 'Node.js'],
      certifications: ['AWS SAA', '応用情報技術者'],
      education: '東京大学 工学部',
      yearsOfExperience: 8,
      additionalNotes: 'リモートワーク希望',
    }

    const result = formatProfileContext(profile)
    expect(result).toContain('氏名: 田中太郎')
    expect(result).toContain('ふりがな: たなかたろう')
    expect(result).toContain('現職: ABC株式会社 / シニアエンジニア')
    expect(result).toContain('志望先: XYZ株式会社 / テックリード')
    expect(result).toContain('過去の企業: DEF Inc., GHI Corp.')
    expect(result).toContain('主要技術: TypeScript, React, Node.js')
    expect(result).toContain('資格: AWS SAA, 応用情報技術者')
    expect(result).toContain('学歴: 東京大学 工学部')
    expect(result).toContain('経験年数: 8年')
    expect(result).toContain('特記: リモートワーク希望')
  })

  it('formats minimal profile', () => {
    const profile: InterviewProfile = { fullName: '田中太郎' }
    const result = formatProfileContext(profile)
    expect(result).toBe('氏名: 田中太郎')
  })

  it('handles partial current position', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      currentCompany: 'ABC株式会社',
    }
    const result = formatProfileContext(profile)
    expect(result).toContain('現職: ABC株式会社')
  })

  it('handles yearsOfExperience of 0', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      yearsOfExperience: 0,
    }
    const result = formatProfileContext(profile)
    expect(result).toContain('経験年数: 0年')
  })

  it('skips empty arrays', () => {
    const profile: InterviewProfile = {
      fullName: '田中太郎',
      technologies: [],
      certifications: [],
      previousCompanies: [],
    }
    const result = formatProfileContext(profile)
    expect(result).not.toContain('主要技術')
    expect(result).not.toContain('資格')
    expect(result).not.toContain('過去の企業')
  })
})

describe('validateInterviewProfile', () => {
  it('accepts valid minimal profile', () => {
    const result = validateInterviewProfile({ fullName: '田中太郎' })
    expect('error' in result).toBe(false)
    expect((result as InterviewProfile).fullName).toBe('田中太郎')
  })

  it('accepts valid full profile', () => {
    const input = {
      fullName: '田中太郎',
      nameReading: 'たなかたろう',
      currentCompany: 'ABC株式会社',
      currentPosition: 'エンジニア',
      targetCompany: 'XYZ株式会社',
      targetPosition: 'テックリード',
      previousCompanies: ['DEF Inc.'],
      technologies: ['TypeScript', 'React'],
      certifications: ['AWS SAA'],
      education: '東京大学',
      yearsOfExperience: 5,
      additionalNotes: 'リモートワーク希望',
    }
    const result = validateInterviewProfile(input)
    expect('error' in result).toBe(false)
  })

  it('rejects null input', () => {
    const result = validateInterviewProfile(null)
    expect('error' in result).toBe(true)
  })

  it('rejects non-object input', () => {
    const result = validateInterviewProfile('string')
    expect('error' in result).toBe(true)
  })

  it('rejects missing fullName', () => {
    const result = validateInterviewProfile({ nameReading: 'test' })
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toContain('fullName')
  })

  it('rejects empty fullName', () => {
    const result = validateInterviewProfile({ fullName: '   ' })
    expect('error' in result).toBe(true)
  })

  it('rejects fullName exceeding max length', () => {
    const result = validateInterviewProfile({ fullName: 'a'.repeat(201) })
    expect('error' in result).toBe(true)
  })

  it('trims string fields', () => {
    const result = validateInterviewProfile({
      fullName: '  田中太郎  ',
      nameReading: '  たなかたろう  ',
    })
    expect('error' in result).toBe(false)
    const profile = result as InterviewProfile
    expect(profile.fullName).toBe('田中太郎')
    expect(profile.nameReading).toBe('たなかたろう')
  })

  it('rejects non-string optional fields', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      nameReading: 123,
    })
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toContain('nameReading')
  })

  it('rejects non-array for array fields', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      technologies: 'TypeScript',
    })
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toContain('technologies')
  })

  it('rejects array items exceeding max length', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      technologies: ['a'.repeat(201)],
    })
    expect('error' in result).toBe(true)
  })

  it('rejects too many array items', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      technologies: Array.from({ length: 21 }, (_, i) => `tech-${i}`),
    })
    expect('error' in result).toBe(true)
  })

  it('filters empty strings from arrays', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      technologies: ['TypeScript', '', '  ', 'React'],
    })
    expect('error' in result).toBe(false)
    const profile = result as InterviewProfile
    expect(profile.technologies).toEqual(['TypeScript', 'React'])
  })

  it('rejects non-numeric yearsOfExperience', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      yearsOfExperience: 'five',
    })
    expect('error' in result).toBe(true)
  })

  it('rejects negative yearsOfExperience', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      yearsOfExperience: -1,
    })
    expect('error' in result).toBe(true)
  })

  it('rejects yearsOfExperience over 60', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      yearsOfExperience: 61,
    })
    expect('error' in result).toBe(true)
  })

  it('floors yearsOfExperience to integer', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      yearsOfExperience: 5.7,
    })
    expect('error' in result).toBe(false)
    expect((result as InterviewProfile).yearsOfExperience).toBe(5)
  })

  it('rejects additionalNotes exceeding max length', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      additionalNotes: 'a'.repeat(1001),
    })
    expect('error' in result).toBe(true)
  })

  it('ignores null/undefined/empty optional fields', () => {
    const result = validateInterviewProfile({
      fullName: '田中太郎',
      nameReading: null,
      currentCompany: undefined,
      education: '',
    })
    expect('error' in result).toBe(false)
    const profile = result as InterviewProfile
    expect(profile.nameReading).toBeUndefined()
    expect(profile.currentCompany).toBeUndefined()
    expect(profile.education).toBeUndefined()
  })
})
