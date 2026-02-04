import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioCapture } from '../../src/renderer/src/hooks/useAudioCapture'

// Get reference to mocked APIs
const mockGetUserMedia = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
const mockElectronStt = window.electron.stt

describe('useAudioCapture', () => {
  let mockMediaStream: MediaStream
  let mockAudioContext: AudioContext
  let mockProcessor: ScriptProcessorNode

  beforeEach(() => {
    vi.clearAllMocks()

    // Setup mock MediaStream
    mockMediaStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
    } as unknown as MediaStream

    // Setup mock AudioContext
    mockProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    } as unknown as ScriptProcessorNode

    mockAudioContext = {
      sampleRate: 48000,
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
      })),
      createScriptProcessor: vi.fn(() => mockProcessor),
      destination: {},
      close: vi.fn(),
    } as unknown as AudioContext

    // Mock AudioContext constructor
    globalThis.AudioContext = vi.fn(() => mockAudioContext) as unknown as typeof AudioContext

    mockGetUserMedia.mockResolvedValue(mockMediaStream)
  })

  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useAudioCapture())

      expect(result.current.isCapturing).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  describe('startCapture', () => {
    it('should request microphone access', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
    })

    it('should create AudioContext and processor', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      expect(AudioContext).toHaveBeenCalled()
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1)
      expect(result.current.isCapturing).toBe(true)
    })

    it('should handle microphone access error', async () => {
      const errorMessage = 'Permission denied'
      mockGetUserMedia.mockRejectedValue(new Error(errorMessage))

      const { result } = renderHook(() => useAudioCapture())

      let caughtError: Error | null = null
      await act(async () => {
        try {
          await result.current.startCapture()
        } catch (err) {
          caughtError = err as Error
        }
      })

      expect(caughtError).not.toBeNull()
      expect(result.current.isCapturing).toBe(false)
      expect(result.current.error).not.toBeNull()
      expect(result.current.error).toMatch(/マイクへのアクセスに失敗しました/)
    })

    it('should process audio data and send to main process', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      // Simulate audio processing
      const mockInputBuffer = {
        getChannelData: vi.fn(() => new Float32Array(4096).fill(0.5)),
      }
      const mockEvent = {
        inputBuffer: mockInputBuffer,
      }

      act(() => {
        if (mockProcessor.onaudioprocess) {
          ;(mockProcessor.onaudioprocess as unknown as (e: typeof mockEvent) => void)(mockEvent)
        }
      })

      expect(mockElectronStt.sendAudio).toHaveBeenCalled()
    })
  })

  describe('stopCapture', () => {
    it('should stop capturing and cleanup resources', async () => {
      // Mock close to return a resolved promise
      mockAudioContext.close = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() => useAudioCapture())

      // Start capture first
      await act(async () => {
        await result.current.startCapture()
      })

      expect(result.current.isCapturing).toBe(true)

      // Stop capture (now async)
      await act(async () => {
        await result.current.stopCapture()
      })

      expect(result.current.isCapturing).toBe(false)
      expect(mockProcessor.disconnect).toHaveBeenCalled()
      expect(mockAudioContext.close).toHaveBeenCalled()
    })

    it('should stop media stream tracks', async () => {
      const mockTrack = { stop: vi.fn() }
      mockMediaStream = {
        getTracks: vi.fn(() => [mockTrack]),
      } as unknown as MediaStream
      mockGetUserMedia.mockResolvedValue(mockMediaStream)

      // Mock close to return a resolved promise
      mockAudioContext.close = vi.fn().mockResolvedValue(undefined)

      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      await act(async () => {
        await result.current.stopCapture()
      })

      expect(mockTrack.stop).toHaveBeenCalled()
    })
  })

  describe('audio resampling', () => {
    it('should resample audio from 48kHz to 16kHz', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      // Simulate audio processing with 48kHz input
      const inputSamples = 4096
      const expectedOutputSamples = Math.floor(inputSamples / 3) // 48000 / 16000 = 3

      const mockInputBuffer = {
        getChannelData: vi.fn(() => new Float32Array(inputSamples).fill(0.5)),
      }
      const mockEvent = {
        inputBuffer: mockInputBuffer,
      }

      let sentData: ArrayBuffer | null = null
      ;(mockElectronStt.sendAudio as ReturnType<typeof vi.fn>).mockImplementation((data) => {
        sentData = data
      })

      act(() => {
        if (mockProcessor.onaudioprocess) {
          ;(mockProcessor.onaudioprocess as unknown as (e: typeof mockEvent) => void)(mockEvent)
        }
      })

      // Check that resampled data was sent
      expect(sentData).not.toBeNull()
      if (sentData) {
        const int16Array = new Int16Array(sentData)
        // Allow some tolerance for rounding
        expect(int16Array.length).toBeCloseTo(expectedOutputSamples, -1)
      }
    })
  })
})
