import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseDocuments = vi.fn()

vi.mock('../../src/renderer/src/hooks/useDocuments', () => ({
  useDocuments: () => mockUseDocuments(),
}))

import DocumentUploadPanel from '../../src/renderer/src/components/DocumentUploadPanel'

describe('DocumentUploadPanel', () => {
  const mockUploadDocument = vi.fn()
  const mockRemoveDocument = vi.fn()

  const defaultHookReturn = {
    documents: [] as DocumentInfo[],
    isUploading: false,
    isInitialized: true,
    error: null as string | null,
    uploadDocument: mockUploadDocument,
    removeDocument: mockRemoveDocument,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDocuments.mockReturnValue(defaultHookReturn)
  })

  it('should show loading spinner when not initialized', () => {
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, isInitialized: false })
    render(<DocumentUploadPanel />)
    expect(screen.getByText('初期化中...')).toBeDefined()
    expect(screen.queryByText('履歴書')).toBeNull()
  })

  it('should render resume and job posting sections', () => {
    render(<DocumentUploadPanel />)
    expect(screen.getByText('履歴書')).toBeDefined()
    expect(screen.getByText('求人票')).toBeDefined()
  })

  it('should show add buttons', () => {
    render(<DocumentUploadPanel />)
    const addButtons = screen.getAllByText('追加')
    expect(addButtons.length).toBe(2)
  })

  it('should call uploadDocument for resume on add click', () => {
    render(<DocumentUploadPanel />)
    const addButtons = screen.getAllByText('追加')
    fireEvent.click(addButtons[0])
    expect(mockUploadDocument).toHaveBeenCalledWith('resume')
  })

  it('should call uploadDocument for job_posting on add click', () => {
    render(<DocumentUploadPanel />)
    const addButtons = screen.getAllByText('追加')
    fireEvent.click(addButtons[1])
    expect(mockUploadDocument).toHaveBeenCalledWith('job_posting')
  })

  it('should display documents when they exist', () => {
    const docs: DocumentInfo[] = [
      { id: '1', name: '田中太郎_履歴書.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 },
      { id: '2', name: 'AIエンジニア求人.docx', type: 'job_posting', uploadedAt: Date.now(), chunkCount: 3 },
    ]
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, documents: docs })

    render(<DocumentUploadPanel />)
    expect(screen.getByText('田中太郎_履歴書.pdf')).toBeDefined()
    expect(screen.getByText('AIエンジニア求人.docx')).toBeDefined()
  })

  it('should display chunk count for documents', () => {
    const docs: DocumentInfo[] = [
      { id: '1', name: 'test.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 },
    ]
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, documents: docs })

    render(<DocumentUploadPanel />)
    expect(screen.getByText(/5.*チャンク/)).toBeDefined()
  })

  it('should show error when error exists', () => {
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, error: 'アップロードに失敗しました' })
    render(<DocumentUploadPanel />)
    expect(screen.getByText('アップロードに失敗しました')).toBeDefined()
  })

  it('should show file format hint', () => {
    render(<DocumentUploadPanel />)
    expect(screen.getByText(/PDF.*DOCX.*10MB/)).toBeDefined()
  })

  it('should show empty state messages', () => {
    render(<DocumentUploadPanel />)
    expect(screen.getByText('履歴書をアップロード')).toBeDefined()
    expect(screen.getByText('求人票をアップロード')).toBeDefined()
  })
})
