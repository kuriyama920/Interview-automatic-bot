import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSTT } from '../../src/renderer/src/hooks/useSTT'

// Get reference to mocked electron API
const mockElectronStt = window.electron.stt

describe('useSTT', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(mockElectronStt.start as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockElectronStt.stop as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })
    ;(mockElectronStt.status as ReturnType<typeof vi.fn>).mockResolvedValue({ connected: false })
  })

  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useSTT())

      expect(result.current.isConnected).toBe(false)
      expect(result.current.transcripts).toEqual([])
      expect(result.current.currentText).toBe('')
      expect(result.current.error).toBeNull()
    })
  })

  describe('connect', () => {
    it('should connect successfully', async () => {
      const { result } = renderHook(() => useSTT())

      await act(async () => {
        await result.current.connect()
      })

      // connect() no longer takes apiKey - it's handled by Main process
      expect(mockElectronStt.start).toHaveBeenCalledWith()
      expect(result.current.isConnected).toBe(true)
    })

    it('should handle connection error', async () => {
      const errorMessage = 'Invalid API key'
      ;(mockElectronStt.start as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: errorMessage,
      })

      const { result } = renderHook(() => useSTT())

      let caughtError: Error | null = null
      await act(async () => {
        try {
          await result.current.connect()
        } catch (err) {
          caughtError = err as Error
        }
      })

      expect(caughtError).not.toBeNull()
      expect(caughtError?.message).toBe(errorMessage)
      expect(result.current.isConnected).toBe(false)
      expect(result.current.error).toBe(errorMessage)
    })
  })

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      const { result } = renderHook(() => useSTT())

      // First connect
      await act(async () => {
        await result.current.connect()
      })

      // Then disconnect
      await act(async () => {
        await result.current.disconnect()
      })

      expect(mockElectronStt.stop).toHaveBeenCalled()
      expect(result.current.isConnected).toBe(false)
    })
  })

  describe('transcript handling', () => {
    it('should setup transcript listener on mount', () => {
      renderHook(() => useSTT())

      expect(mockElectronStt.onTranscript).toHaveBeenCalled()
    })

    it('should cleanup listener on unmount', () => {
      const { unmount } = renderHook(() => useSTT())

      unmount()

      expect(mockElectronStt.removeTranscriptListener).toHaveBeenCalled()
    })

    it('should update currentText for non-final transcripts', async () => {
      let transcriptCallback: ((result: unknown) => void) | null = null
      ;(mockElectronStt.onTranscript as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
        transcriptCallback = callback
      })

      const { result } = renderHook(() => useSTT())

      // Simulate receiving a non-final transcript
      act(() => {
        if (transcriptCallback) {
          transcriptCallback({
            text: 'Hello',
            isFinal: false,
            confidence: 0.8,
            timestamp: Date.now(),
          })
        }
      })

      expect(result.current.currentText).toBe('Hello')
      expect(result.current.transcripts).toHaveLength(0)
    })

    it('should add to transcripts for final transcripts', async () => {
      let transcriptCallback: ((result: unknown) => void) | null = null
      ;(mockElectronStt.onTranscript as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
        transcriptCallback = callback
      })

      const { result } = renderHook(() => useSTT())

      // Simulate receiving a final transcript
      act(() => {
        if (transcriptCallback) {
          transcriptCallback({
            text: 'Hello world',
            isFinal: true,
            confidence: 0.95,
            timestamp: Date.now(),
          })
        }
      })

      expect(result.current.currentText).toBe('')
      expect(result.current.transcripts).toHaveLength(1)
      expect(result.current.transcripts[0].text).toBe('Hello world')
    })
  })

  describe('clearTranscripts', () => {
    it('should clear all transcripts', async () => {
      let transcriptCallback: ((result: unknown) => void) | null = null
      ;(mockElectronStt.onTranscript as ReturnType<typeof vi.fn>).mockImplementation((callback) => {
        transcriptCallback = callback
      })

      const { result } = renderHook(() => useSTT())

      // Add some transcripts
      act(() => {
        if (transcriptCallback) {
          transcriptCallback({
            text: 'Test transcript',
            isFinal: true,
            confidence: 0.9,
            timestamp: Date.now(),
          })
        }
      })

      expect(result.current.transcripts).toHaveLength(1)

      // Clear transcripts
      act(() => {
        result.current.clearTranscripts()
      })

      expect(result.current.transcripts).toHaveLength(0)
      expect(result.current.currentText).toBe('')
    })
  })
})
