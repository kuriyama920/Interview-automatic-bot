/**
 * Document Parser Utility
 *
 * サーバーサイドでPDF/DOCXを解析し、テキストをチャンクに分割する
 * Workers互換: mammothの代わりにJSZipでDOCXを直接解析
 */

import pdfParse from 'pdf-parse'
import JSZip from 'jszip'

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface ParsedDocument {
  text: string
  pageCount?: number
  wordCount: number
}

export interface DocumentChunk {
  content: string
  chunkIndex: number
}

/**
 * ファイルサイズを検証
 */
export function validateFileSize(size: number): void {
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  }
}

/**
 * ファイル拡張子を検証
 */
export function validateFileType(filename: string): 'pdf' | 'docx' | 'txt' {
  const extension = filename.toLowerCase().split('.').pop()

  if (extension === 'pdf') {
    return 'pdf'
  } else if (extension === 'docx') {
    return 'docx'
  } else if (extension === 'txt') {
    return 'txt'
  } else {
    throw new Error(`Unsupported file type: ${extension}. Supported types: pdf, docx, txt`)
  }
}

/**
 * PDFファイルを解析
 */
async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  const data = await pdfParse(buffer)
  const text = data.text.trim()

  return {
    text,
    pageCount: data.numpages,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }
}

/**
 * XMLエンティティをデコード
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

/**
 * DOCX XMLからテキストを抽出
 * w:t タグのテキストを抽出し、w:p（段落）ごとに改行を挿入
 * w:br タグで行分割を保持
 */
function extractTextFromDocxXml(xml: string): string {
  const paragraphs: string[] = []

  // w:p タグで段落を分割（自己閉じタグも対応）
  const pRegex = /<w:p[\s>][\s\S]*?<\/w:p>|<w:p\s*\/>/g
  let pMatch: RegExpExecArray | null

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pContent = pMatch[0]
    const parts: string[] = []

    // w:t と w:br タグを順番に処理
    const tokenRegex = /<w:br\s*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
    let tokenMatch: RegExpExecArray | null

    while ((tokenMatch = tokenRegex.exec(pContent)) !== null) {
      if (tokenMatch[0].startsWith('<w:br')) {
        parts.push('\n')
      } else if (tokenMatch[1] !== undefined) {
        parts.push(decodeXmlEntities(tokenMatch[1]))
      }
    }

    if (parts.length > 0) {
      paragraphs.push(parts.join(''))
    }
  }

  return paragraphs.join('\n')
}

/**
 * DOCXファイルを解析（JSZipで直接展開）
 */
async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const zip = await JSZip.loadAsync(arrayBuffer)

  const documentXml = zip.file('word/document.xml')
  if (!documentXml) {
    throw new Error('Invalid DOCX: word/document.xml not found')
  }

  const xml = await documentXml.async('string')
  const text = extractTextFromDocxXml(xml).trim()

  return {
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }
}

/**
 * TXTファイルを解析
 */
function parseTXT(buffer: Buffer): ParsedDocument {
  const text = buffer.toString('utf-8').trim()

  return {
    text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
  }
}

/**
 * ドキュメントを解析してテキストを抽出
 */
export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedDocument> {
  validateFileSize(buffer.length)
  const fileType = validateFileType(filename)

  if (fileType === 'pdf') {
    return parsePDF(buffer)
  } else if (fileType === 'docx') {
    return parseDOCX(buffer)
  } else {
    return parseTXT(buffer)
  }
}

/**
 * テキストをチャンクに分割
 */
export function chunkText(text: string): DocumentChunk[] {
  const separators = ['\n\n', '\n', '。', '、', ' ', '']
  const chunks: DocumentChunk[] = []

  function splitWithSeparator(text: string, separatorIndex: number): string[] {
    if (separatorIndex >= separators.length) {
      const result: string[] = []
      for (let i = 0; i < text.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
        result.push(text.slice(i, i + CHUNK_SIZE))
      }
      return result
    }

    const separator = separators[separatorIndex]
    if (separator === '') {
      return splitWithSeparator(text, separatorIndex + 1)
    }

    const parts = text.split(separator)
    const result: string[] = []
    let current = ''

    for (const part of parts) {
      const candidate = current ? current + separator + part : part

      if (candidate.length <= CHUNK_SIZE) {
        current = candidate
      } else {
        if (current) {
          result.push(current)
        }
        if (part.length > CHUNK_SIZE) {
          result.push(...splitWithSeparator(part, separatorIndex + 1))
          current = ''
        } else {
          current = part
        }
      }
    }

    if (current) {
      result.push(current)
    }

    return result
  }

  const rawChunks = splitWithSeparator(text, 0)

  for (let i = 0; i < rawChunks.length; i++) {
    let content = rawChunks[i]

    if (i > 0 && CHUNK_OVERLAP > 0) {
      const prevChunk = rawChunks[i - 1]
      const overlapText = prevChunk.slice(-CHUNK_OVERLAP)
      content = overlapText + content
    }

    chunks.push({
      content: content.trim(),
      chunkIndex: i,
    })
  }

  return chunks.filter((chunk) => chunk.content.length > 0)
}

/**
 * トークン数を概算（文字数/4）
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
