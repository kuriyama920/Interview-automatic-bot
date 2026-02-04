import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { createLogger } from './logger.service'
import type { ParsedDocument, DocumentChunk } from '../types/document'

const log = createLogger('document-service')

const CHUNK_SIZE = 500
const CHUNK_OVERLAP = 50
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export class DocumentService {
  private textSplitter: RecursiveCharacterTextSplitter

  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_SIZE,
      chunkOverlap: CHUNK_OVERLAP,
      separators: ['\n\n', '\n', '。', '、', ' ', ''],
    })
    log.debug('Document service initialized')
  }

  async parseFile(filePath: string, fileBuffer: Buffer): Promise<ParsedDocument> {
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    }

    const extension = filePath.toLowerCase().split('.').pop()

    if (extension === 'pdf') {
      return this.parsePDF(fileBuffer)
    } else if (extension === 'docx') {
      return this.parseDOCX(fileBuffer)
    } else {
      throw new Error(`Unsupported file type: ${extension}. Supported types: pdf, docx`)
    }
  }

  private async parsePDF(buffer: Buffer): Promise<ParsedDocument> {
    log.debug('Parsing PDF...', { size: buffer.length })
    try {
      const data = await pdfParse(buffer)
      const text = data.text.trim()

      log.info('PDF parsed successfully', {
        pages: data.numpages,
        textLength: text.length,
      })

      return {
        text,
        metadata: {
          pageCount: data.numpages,
          wordCount: text.split(/\s+/).filter(Boolean).length,
        },
      }
    } catch (error) {
      log.error('Failed to parse PDF', { error: String(error) })
      throw new Error(`Failed to parse PDF: ${String(error)}`)
    }
  }

  private async parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
    log.debug('Parsing DOCX...', { size: buffer.length })
    try {
      const result = await mammoth.extractRawText({ buffer })
      const text = result.value.trim()

      if (result.messages.length > 0) {
        log.warn('DOCX parsing warnings', { messages: result.messages })
      }

      log.info('DOCX parsed successfully', { textLength: text.length })

      return {
        text,
        metadata: {
          wordCount: text.split(/\s+/).filter(Boolean).length,
        },
      }
    } catch (error) {
      log.error('Failed to parse DOCX', { error: String(error) })
      throw new Error(`Failed to parse DOCX: ${String(error)}`)
    }
  }

  async chunkText(
    text: string,
    documentId: string
  ): Promise<Omit<DocumentChunk, 'embedding'>[]> {
    log.debug('Chunking text...', { textLength: text.length })

    const docs = await this.textSplitter.createDocuments([text])

    const chunks = docs.map((doc, index) => ({
      id: `${documentId}-chunk-${index}`,
      documentId,
      content: doc.pageContent,
      metadata: {
        chunkIndex: index,
      },
    }))

    log.info('Text chunked successfully', { chunkCount: chunks.length })

    return chunks
  }
}

export const documentService = new DocumentService()
