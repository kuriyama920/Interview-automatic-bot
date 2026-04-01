import { describe, it, expect } from 'vitest'
import {
  validateFileSize,
  validateFileType,
  parseDocument,
  chunkText,
  estimateTokens,
} from '../../src/lib/document-parser'
import { Buffer } from 'node:buffer'

describe('validateFileSize', () => {
  it('accepts files under 10MB', () => {
    expect(() => validateFileSize(1024)).not.toThrow()
    expect(() => validateFileSize(5 * 1024 * 1024)).not.toThrow()
    expect(() => validateFileSize(10 * 1024 * 1024)).not.toThrow()
  })

  it('rejects files over 10MB', () => {
    expect(() => validateFileSize(10 * 1024 * 1024 + 1)).toThrow('File size exceeds limit')
  })

  it('accepts zero-size file', () => {
    expect(() => validateFileSize(0)).not.toThrow()
  })
})

describe('validateFileType', () => {
  it('accepts PDF files', () => {
    expect(validateFileType('document.pdf')).toBe('pdf')
    expect(validateFileType('DOCUMENT.PDF')).toBe('pdf')
    expect(validateFileType('my.file.pdf')).toBe('pdf')
  })

  it('accepts DOCX files', () => {
    expect(validateFileType('document.docx')).toBe('docx')
    expect(validateFileType('DOCUMENT.DOCX')).toBe('docx')
  })

  it('accepts TXT files', () => {
    expect(validateFileType('document.txt')).toBe('txt')
    expect(validateFileType('DOCUMENT.TXT')).toBe('txt')
    expect(validateFileType('my.notes.txt')).toBe('txt')
  })

  it('rejects unsupported types', () => {
    expect(() => validateFileType('document.doc')).toThrow('Unsupported file type')
    expect(() => validateFileType('document.xlsx')).toThrow('Unsupported file type')
    expect(() => validateFileType('image.png')).toThrow('Unsupported file type')
  })
})

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    const chunks = chunkText('Hello World')
    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toBe('Hello World')
    expect(chunks[0].chunkIndex).toBe(0)
  })

  it('splits long text into multiple chunks', () => {
    const longText = 'あ'.repeat(1200)
    const chunks = chunkText(longText)
    expect(chunks.length).toBeGreaterThan(1)
  })

  it('preserves chunk indices', () => {
    const longText = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. ${'x'.repeat(100)}`).join('\n\n')
    const chunks = chunkText(longText)
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i)
    }
  })

  it('filters empty chunks', () => {
    const chunks = chunkText('')
    expect(chunks.length).toBe(0)
  })

  it('handles text with Japanese characters', () => {
    const text = '日本語テキストのテスト。これはチャンク分割の確認用です。'
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    expect(chunks[0].content).toContain('日本語')
  })

  it('uses paragraph breaks as primary separator', () => {
    const text = 'Paragraph 1 content here.\n\nParagraph 2 content here.\n\nParagraph 3 content here.'
    const chunks = chunkText(text)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
  })
})

describe('parseDocument (TXT)', () => {
  it('parses plain text file', async () => {
    const content = '職務経歴書\n\n氏名：テスト太郎\n\n職務要約\nエンジニアとして5年の経験があります。'
    const buffer = Buffer.from(content, 'utf-8')
    const result = await parseDocument(buffer, 'resume.txt')

    expect(result.text).toBe(content)
    expect(result.wordCount).toBeGreaterThan(0)
    expect(result.pageCount).toBeUndefined()
  })

  it('trims whitespace from TXT', async () => {
    const buffer = Buffer.from('  hello world  \n\n', 'utf-8')
    const result = await parseDocument(buffer, 'test.txt')

    expect(result.text).toBe('hello world')
  })

  it('returns empty text for empty TXT file', async () => {
    const buffer = Buffer.from('', 'utf-8')
    const result = await parseDocument(buffer, 'empty.txt')

    expect(result.text).toBe('')
    expect(result.wordCount).toBe(0)
  })

  it('handles UTF-8 Japanese text in TXT', async () => {
    const content = '求人票\n会社名：株式会社テスト\n職種：フルスタックエンジニア\n給与：年収600万〜800万円'
    const buffer = Buffer.from(content, 'utf-8')
    const result = await parseDocument(buffer, 'job_posting.txt')

    expect(result.text).toContain('株式会社テスト')
    expect(result.text).toContain('フルスタックエンジニア')
  })
})

describe('estimateTokens', () => {
  it('estimates tokens as text length / 4', () => {
    expect(estimateTokens('12345678')).toBe(2) // 8/4 = 2
    expect(estimateTokens('1234567')).toBe(2) // ceil(7/4) = 2
  })

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('handles single character', () => {
    expect(estimateTokens('a')).toBe(1) // ceil(1/4) = 1
  })

  it('handles Japanese text', () => {
    // Japanese chars are still 1 char each in JS
    const text = 'あいうえお' // 5 chars
    expect(estimateTokens(text)).toBe(2) // ceil(5/4) = 2
  })
})
