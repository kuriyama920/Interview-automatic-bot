import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUseDocuments = vi.fn()

vi.mock('../../src/renderer/src/hooks/useDocuments', () => ({
  useDocuments: () => mockUseDocuments(),
}))

vi.mock('../../src/renderer/src/components/ui/PageHeader', () => ({
  PageHeader: ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  ),
}))

vi.mock('../../src/renderer/src/components/ui', () => ({
  Button: ({ children, onClick, isLoading, leftIcon, ...rest }: { children: React.ReactNode; onClick?: () => void; isLoading?: boolean; leftIcon?: React.ReactNode; disabled?: boolean; variant?: string; size?: string }) => (
    <button onClick={onClick} disabled={isLoading || rest.disabled}>{isLoading ? 'Loading...' : children}</button>
  ),
  Spinner: ({ size }: { size?: string }) => <div data-testid="spinner">Loading</div>,
  Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span>,
  ErrorAlert: ({ error }: { error: string }) => <div data-testid="error-alert">{error}</div>,
}))

vi.mock('../../src/renderer/src/components/ui/icons', () => ({
  TrashIcon: () => <span data-testid="trash-icon">trash</span>,
}))

import { DocumentsPage } from '../../src/renderer/src/components/pages/DocumentsPage'

describe('DocumentsPage', () => {
  const mockUploadDocument = vi.fn()
  const mockRemoveDocument = vi.fn()

  const defaultHookReturn = {
    documents: [] as DocumentInfo[],
    isInitialized: true,
    isUploading: false,
    error: null as string | null,
    uploadDocument: mockUploadDocument,
    removeDocument: mockRemoveDocument,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDocuments.mockReturnValue(defaultHookReturn)
  })

  it('should render the page header with correct title', () => {
    render(<DocumentsPage />)
    expect(screen.getByText('資料管理')).toBeDefined()
  })

  it('should render the page header with correct subtitle', () => {
    render(<DocumentsPage />)
    expect(screen.getByText('面接用の履歴書・求人票をアップロードして、AIのコンテキストとして活用')).toBeDefined()
  })

  it('should show spinner when not initialized', () => {
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, isInitialized: false })
    render(<DocumentsPage />)
    expect(screen.getByTestId('spinner')).toBeDefined()
  })

  it('should not show spinner when initialized', () => {
    render(<DocumentsPage />)
    expect(screen.queryByTestId('spinner')).toBeNull()
  })

  it('should render resume section title', () => {
    render(<DocumentsPage />)
    expect(screen.getByText('履歴書・職務経歴書')).toBeDefined()
  })

  it('should render job posting section title', () => {
    render(<DocumentsPage />)
    expect(screen.getByText('求人票・募集要項')).toBeDefined()
  })

  it('should render upload buttons for both sections', () => {
    render(<DocumentsPage />)
    const uploadButtons = screen.getAllByText('アップロード')
    expect(uploadButtons.length).toBe(2)
  })

  it('should call uploadDocument with resume type when resume upload is clicked', () => {
    render(<DocumentsPage />)
    const uploadButtons = screen.getAllByText('アップロード')
    fireEvent.click(uploadButtons[0])
    expect(mockUploadDocument).toHaveBeenCalledWith('resume')
  })

  it('should call uploadDocument with job_posting type when job posting upload is clicked', () => {
    render(<DocumentsPage />)
    const uploadButtons = screen.getAllByText('アップロード')
    fireEvent.click(uploadButtons[1])
    expect(mockUploadDocument).toHaveBeenCalledWith('job_posting')
  })

  it('should show empty state messages when no documents', () => {
    render(<DocumentsPage />)
    const emptyMessages = screen.getAllByText('ファイルをアップロードしてください')
    expect(emptyMessages.length).toBe(2)
  })

  it('should show supported file format text', () => {
    render(<DocumentsPage />)
    const formatTexts = screen.getAllByText('PDF / DOCX / TXT 対応')
    expect(formatTexts.length).toBe(2)
  })

  it('should display documents when they exist', () => {
    const docs: DocumentInfo[] = [
      { id: '1', name: '田中太郎_履歴書.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 },
      { id: '2', name: 'AIエンジニア求人.docx', type: 'job_posting', uploadedAt: Date.now(), chunkCount: 3 },
    ]
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, documents: docs })
    render(<DocumentsPage />)
    expect(screen.getByText('田中太郎_履歴書.pdf')).toBeDefined()
    expect(screen.getByText('AIエンジニア求人.docx')).toBeDefined()
  })

  it('should display chunk count badge for documents', () => {
    const docs: DocumentInfo[] = [
      { id: '1', name: 'test.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 },
    ]
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, documents: docs })
    render(<DocumentsPage />)
    expect(screen.getByText('5 チャンク')).toBeDefined()
  })

  it('should show error alert when error exists', () => {
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, error: 'アップロード失敗' })
    render(<DocumentsPage />)
    expect(screen.getByTestId('error-alert')).toBeDefined()
    expect(screen.getByText('アップロード失敗')).toBeDefined()
  })

  it('should not show error alert when no error', () => {
    render(<DocumentsPage />)
    expect(screen.queryByTestId('error-alert')).toBeNull()
  })

  it('should render section descriptions', () => {
    render(<DocumentsPage />)
    expect(screen.getByText('あなたのスキルや経験をAIが参照します')).toBeDefined()
    expect(screen.getByText('応募先の情報をAIが参照して回答を最適化')).toBeDefined()
  })

  it('should call removeDocument when delete button is clicked', () => {
    const docs: DocumentInfo[] = [
      { id: 'doc-1', name: 'test.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 5 },
    ]
    mockUseDocuments.mockReturnValue({ ...defaultHookReturn, documents: docs })
    render(<DocumentsPage />)
    const deleteButton = screen.getByTitle('削除')
    fireEvent.click(deleteButton)
    expect(mockRemoveDocument).toHaveBeenCalledWith('doc-1')
  })
})
