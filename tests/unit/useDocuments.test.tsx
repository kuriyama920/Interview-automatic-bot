import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('../../src/renderer/src/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

import { useDocuments } from '../../src/renderer/src/hooks/useDocuments'

const mockDocument = window.electron.document

describe('useDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockDocument.init as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockDocument.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      documents: [],
    })
    ;(mockDocument.upload as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, document: null })
    ;(mockDocument.remove as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
  })

  it('should start as not initialized', () => {
    const { result } = renderHook(() => useDocuments())
    expect(result.current.isInitialized).toBe(false)
    expect(result.current.isUploading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.documents).toEqual([])
  })

  it('should initialize and load documents on mount', async () => {
    const docs: DocumentInfo[] = [
      { id: '1', name: 'resume.pdf', type: 'resume', uploadedAt: Date.now(), chunkCount: 3 },
    ]
    ;(mockDocument.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      documents: docs,
    })

    const { result } = renderHook(() => useDocuments())

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true)
    })

    expect(result.current.documents).toEqual(docs)
    expect(result.current.error).toBeNull()
  })

  it('should set error when init fails', async () => {
    ;(mockDocument.init as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: '初期化に失敗しました',
    })

    const { result } = renderHook(() => useDocuments())

    await waitFor(() => {
      expect(result.current.error).toBe('初期化に失敗しました')
    })

    expect(result.current.isInitialized).toBe(false)
  })

  it('should upload document and refresh list', async () => {
    const newDoc: DocumentInfo = { id: '2', name: 'job.pdf', type: 'job_posting', uploadedAt: Date.now(), chunkCount: 2 }
    ;(mockDocument.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      document: newDoc,
    })
    ;(mockDocument.list as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ success: true, documents: [] })
      .mockResolvedValue({ success: true, documents: [newDoc] })

    const { result } = renderHook(() => useDocuments())

    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.uploadDocument('job_posting')
    })

    expect(mockDocument.upload).toHaveBeenCalledWith('job_posting')
    expect(result.current.isUploading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should set error when upload fails', async () => {
    ;(mockDocument.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'アップロードエラー',
    })

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.uploadDocument('resume')
    })

    expect(result.current.error).toBe('アップロードエラー')
  })

  it('should not set error when upload cancelled (No file selected)', async () => {
    ;(mockDocument.upload as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'No file selected',
    })

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.uploadDocument('resume')
    })

    expect(result.current.error).toBeNull()
  })

  it('should remove document and refresh list', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.removeDocument('doc-1')
    })

    expect(mockDocument.remove).toHaveBeenCalledWith('doc-1')
  })

  it('should set error when remove fails', async () => {
    ;(mockDocument.remove as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: '削除に失敗しました',
    })

    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.removeDocument('doc-1')
    })

    expect(result.current.error).toBe('削除に失敗しました')
  })

  it('should refresh documents', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isInitialized).toBe(true))

    await act(async () => {
      await result.current.refreshDocuments()
    })

    expect(mockDocument.list).toHaveBeenCalledTimes(2) // once on init, once on refresh
  })
})
