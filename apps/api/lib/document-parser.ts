/**
 * Document Parser Utility
 *
 * サーバーサイドでPDF/DOCXを解析し、テキストをチャンクに分割する
 * 既存の src/services/document.service.ts のロジックを移植
 */

import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

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
export function validateFileType(filename: string): 'pdf' | 'docx' {
  const extension = filename.toLowerCase().split('.').pop()

  if (extension === 'pdf') {
    return 'pdf'
  } else if (extension === 'docx') {
    return 'docx'
  } else {
    throw new Error(`Unsupported file type: ${extension}. Supported types: pdf, docx`)
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
 * DOCXファイルを解析
 */
async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  const result = await mammoth.extractRawText({ buffer })
  const text = result.value.trim()

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
  } else {
    return parseDOCX(buffer)
  }
}

/**
 * テキストをチャンクに分割
 * LangChainのRecursiveCharacterTextSplitterと同様のロジック
 */
export function chunkText(text: string): DocumentChunk[] {
  const separators = ['\n\n', '\n', '。', '、', ' ', '']
  const chunks: DocumentChunk[] = []

  function splitWithSeparator(text: string, separatorIndex: number): string[] {
    if (separatorIndex >= separators.length) {
      // 最後の手段: 文字単位で分割
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
        // 部分がチャンクサイズより大きい場合、再帰的に分割
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

  // オーバーラップを考慮したチャンク生成
  const rawChunks = splitWithSeparator(text, 0)

  for (let i = 0; i < rawChunks.length; i++) {
    let content = rawChunks[i]

    // 前のチャンクの末尾をオーバーラップとして追加
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
