import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioCapture } from '../../src/renderer/src/hooks/useAudioCapture'

// Get reference to mocked APIs
const mockGetUserMedia = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
const mockGetDisplayMedia = navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>
const mockElectronStt = window.electron.stt

describe('useAudioCapture', () => {
  let mockMediaStream: MediaStream
  let mockDisplayMediaStream: MediaStream
  let mockAudioContext: AudioContext
  let mockWorkletNode: AudioWorkletNode
  let workletMessageHandler: ((e: MessageEvent) => void) | null

  beforeEach(() => {
    vi.clearAllMocks()
    workletMessageHandler = null

    // Setup mock MediaStream (for mic)
    mockMediaStream = {
      getTracks: vi.fn(() => [{ stop: vi.fn() }]),
      getAudioTracks: vi.fn(() => [{ label: 'Default', stop: vi.fn() }]),
    } as unknown as MediaStream

    // Setup mock DisplayMedia stream (for system audio)
    const mockVideoTrack = { stop: vi.fn(), kind: 'video' }
    const mockAudioTrack = { stop: vi.fn(), kind: 'audio', label: 'System Audio' }
    mockDisplayMediaStream = {
      getTracks: vi.fn(() => [mockVideoTrack, mockAudioTrack]),
      getAudioTracks: vi.fn(() => [mockAudioTrack]),
      getVideoTracks: vi.fn(() => [mockVideoTrack]),
      removeTrack: vi.fn(),
    } as unknown as MediaStream

    // Setup mock AudioWorkletNode
    mockWorkletNode = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      port: {
        get onmessage() {
          return workletMessageHandler
        },
        set onmessage(handler: ((e: MessageEvent) => void) | null) {
          workletMessageHandler = handler
        },
        postMessage: vi.fn(),
      },
    } as unknown as AudioWorkletNode

    // Setup mock AudioContext with AudioWorklet support
    mockAudioContext = {
      sampleRate: 48000,
      createMediaStreamSource: vi.fn(() => ({
        connect: vi.fn(),
      })),
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
      audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as AudioContext

    // Mock AudioContext constructor
    globalThis.AudioContext = vi.fn(() => mockAudioContext) as unknown as typeof AudioContext

    // Mock AudioWorkletNode constructor
    globalThis.AudioWorkletNode = vi.fn(() => mockWorkletNode) as unknown as typeof AudioWorkletNode

    // Mock URL.createObjectURL / revokeObjectURL
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    globalThis.URL.revokeObjectURL = vi.fn()

    // Mock Blob
    globalThis.Blob = vi.fn(() => ({})) as unknown as typeof Blob

    mockGetUserMedia.mockResolvedValue(mockMediaStream)
    mockGetDisplayMedia.mockResolvedValue(mockDisplayMediaStream)
  })

  describe('initial state', () => {
    it('should return initial state correctly', () => {
      const { result } = renderHook(() => useAudioCapture())

      expect(result.current.isCapturing).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  describe('startCapture', () => {
    it('should request system audio via getDisplayMedia (default mode)', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true,
      })
    })

    it('should request microphone access when audioSource is mic', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        result.current.setAudioSource('mic')
      })

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

    it('should create AudioContext and AudioWorklet processor', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      expect(AudioContext).toHaveBeenCalled()
      expect(mockAudioContext.audioWorklet.addModule).toHaveBeenCalled()
      expect(AudioWorkletNode).toHaveBeenCalledWith(mockAudioContext, 'audio-capture-processor')
      expect(result.current.isCapturing).toBe(true)
    })

    it('should handle system audio access error', async () => {
      const errorMessage = 'Permission denied'
      mockGetDisplayMedia.mockRejectedValue(new Error(errorMessage))

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
      expect(result.current.error).toMatch(/音声キャプチャに失敗しました/)
    })

    it('should process audio data and send to main process via worklet', async () => {
      const { result } = renderHook(() => useAudioCapture())

      await act(async () => {
        await result.current.startCapture()
      })

      // Simulate AudioWorklet posting audio data
      const mockAudioData = new Float32Array(4096).fill(0.5)

      act(() => {
        if (workletMessageHandler) {
          workletMessageHandler({ data: mockAudioData } as MessageEvent)
        }
      })

      expect(mockElectronStt.sendAudio).toHaveBeenCalled()
    })
  })

  describe('stopCapture', () => {
    it('should stop capturing and cleanup resources', async () => {
      const { result } = renderHook(() => useAudioCapture())

      // Start capture first
      await act(async () => {
        await result.current.startCapture()
      })

      expect(result.current.isCapturing).toBe(true)

      // Stop capture
      await act(async () => {
        await result.current.stopCapture()
      })

      expect(result.current.isCapturing).toBe(false)
      expect(mockWorkletNode.disconnect).toHaveBeenCalled()
      expect(mockAudioContext.close).toHaveBeenCalled()
    })

    it('should stop media stream tracks', async () => {
      const mockTrack = { stop: vi.fn(), kind: 'audio', label: 'System Audio' }
      const mockVideoTrack = { stop: vi.fn(), kind: 'video' }
      mockDisplayMediaStream = {
        getTracks: vi.fn(() => [mockVideoTrack, mockTrack]),
        getAudioTracks: vi.fn(() => [mockTrack]),
        getVideoTracks: vi.fn(() => [mockVideoTrack]),
        removeTrack: vi.fn(),
      } as unknown as MediaStream
      mockGetDisplayMedia.mockResolvedValue(mockDisplayMediaStream)

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

      // Simulate audio processing with 48kHz input via AudioWorklet
      const inputSamples = 4096
      const expectedOutputSamples = Math.floor(inputSamples / 3) // 48000 / 16000 = 3

      let sentData: ArrayBuffer | null = null
      ;(mockElectronStt.sendAudio as ReturnType<typeof vi.fn>).mockImplementation((data) => {
        sentData = data
      })

      const mockAudioData = new Float32Array(inputSamples).fill(0.5)

      act(() => {
        if (workletMessageHandler) {
          workletMessageHandler({ data: mockAudioData } as MessageEvent)
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
