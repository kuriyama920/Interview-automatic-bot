import { useState, useCallback, useRef, useEffect } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('AudioCapture')

// 音声ソースの種類
export type AudioSource = 'mic' | 'system' | 'both'

interface UseAudioCaptureReturn {
  isCapturing: boolean
  error: string | null
  audioSource: AudioSource
  setAudioSource: (source: AudioSource) => Promise<void>
  startCapture: () => Promise<void>
  stopCapture: () => Promise<void>
}

const TARGET_SAMPLE_RATE = 16000

// サンプルレート変換（リサンプリング）
function resampleAudio(inputData: Float32Array, inputSampleRate: number, outputSampleRate: number): Float32Array {
  if (inputSampleRate === outputSampleRate) {
    return inputData
  }

  const ratio = inputSampleRate / outputSampleRate
  const outputLength = Math.floor(inputData.length / ratio)
  const output = new Float32Array(outputLength)

  for (let i = 0; i < outputLength; i++) {
    const srcIndex = i * ratio
    const srcIndexFloor = Math.floor(srcIndex)
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1)
    const t = srcIndex - srcIndexFloor

    // 線形補間
    output[i] = inputData[srcIndexFloor] * (1 - t) + inputData[srcIndexCeil] * t
  }

  return output
}

// Float32をInt16に変換
function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return int16Array
}

export function useAudioCapture(): UseAudioCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioSource, setAudioSourceState] = useState<AudioSource>('mic')

  // ストリーム参照
  const micStreamRef = useRef<MediaStream | null>(null)
  const systemStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioChunkCount = useRef(0)
  const actualSampleRate = useRef<number>(0)

  // 初期化時に保存された音声ソース設定を読み込む
  useEffect(() => {
    const loadAudioSource = async () => {
      try {
        const result = await window.electron.audio.getSource()
        if (result.success && result.source) {
          setAudioSourceState(result.source)
          log.debug('Loaded audio source setting', { source: result.source })
        }
      } catch (err) {
        log.error('Failed to load audio source setting', { error: String(err) })
      }
    }
    loadAudioSource()
  }, [])

  // 音声ソースを設定（IPC経由で永続化）
  const setAudioSource = useCallback(async (source: AudioSource) => {
    log.info('Setting audio source', { source })
    try {
      const result = await window.electron.audio.setSource(source)
      if (result.success) {
        setAudioSourceState(source)
      } else {
        throw new Error(result.error || 'Failed to set audio source')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to set audio source', { error: message })
      throw err
    }
  }, [])

  // マイク音声を取得
  const captureMicAudio = useCallback(async (): Promise<MediaStream> => {
    log.debug('Requesting microphone access...')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    log.info('Microphone access granted')
    return stream
  }, [])

  // システム音声を取得（getDisplayMedia経由）
  // メインプロセスでsetDisplayMediaRequestHandlerが設定されているため、
  // ダイアログなしでシステム音声（loopback）が取得される
  const captureSystemAudio = useCallback(async (): Promise<MediaStream> => {
    log.debug('Requesting system audio access...')

    try {
      // getDisplayMediaでシステム音声をキャプチャ
      // video: true はAPIの仕様上必須（後で停止）
      // audio: true でシステム音声（loopbackで設定済み）を取得
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,  // APIの仕様上必須
        audio: true,  // システム音声
      })

      // ビデオトラックは不要なので即座に停止
      stream.getVideoTracks().forEach(track => {
        track.stop()
        stream.removeTrack(track)
      })

      // オーディオトラックが取得できたか確認
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        throw new Error('システム音声のキャプチャに失敗しました')
      }

      log.info('System audio access granted', {
        audioTracks: audioTracks.length,
        trackLabel: audioTracks[0]?.label
      })

      return stream
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      log.error('Failed to capture system audio', { error: message })
      throw new Error(`システム音声のキャプチャに失敗しました: ${message}`)
    }
  }, [])

  // 複数のオーディオストリームをミキシング
  const mixAudioStreams = useCallback((
    audioContext: AudioContext,
    streams: MediaStream[]
  ): MediaStreamAudioSourceNode[] => {
    const sources: MediaStreamAudioSourceNode[] = []

    for (const stream of streams) {
      if (stream.getAudioTracks().length > 0) {
        const source = audioContext.createMediaStreamSource(stream)
        sources.push(source)
        log.debug('Created audio source', {
          tracks: stream.getAudioTracks().length,
          label: stream.getAudioTracks()[0]?.label
        })
      }
    }

    return sources
  }, [])

  const startCapture = useCallback(async () => {
    log.info('Starting capture...', { audioSource })
    try {
      setError(null)
      const streams: MediaStream[] = []

      // 音声ソースに応じてストリームを取得
      // 途中で失敗した場合は取得済みストリームをクリーンアップ
      try {
        if (audioSource === 'mic' || audioSource === 'both') {
          const micStream = await captureMicAudio()
          micStreamRef.current = micStream
          streams.push(micStream)
        }

        if (audioSource === 'system' || audioSource === 'both') {
          const systemStream = await captureSystemAudio()
          systemStreamRef.current = systemStream
          streams.push(systemStream)
        }
      } catch (err) {
        // 部分的に取得したストリームをクリーンアップ
        log.warn('Cleaning up partially acquired streams due to error')
        streams.forEach(stream => stream.getTracks().forEach(track => track.stop()))
        micStreamRef.current = null
        systemStreamRef.current = null
        throw err
      }

      if (streams.length === 0) {
        throw new Error('音声ソースが選択されていません')
      }

      // AudioContextを作成
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      actualSampleRate.current = audioContext.sampleRate
      log.debug('AudioContext created', {
        sampleRate: audioContext.sampleRate,
        targetSampleRate: TARGET_SAMPLE_RATE,
        resamplingRatio: audioContext.sampleRate / TARGET_SAMPLE_RATE,
        audioSource,
        streamCount: streams.length,
      })

      // ScriptProcessorNodeを作成
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      audioChunkCount.current = 0

      // 複数ストリームをミキシング
      const sources = mixAudioStreams(audioContext, streams)

      // すべてのソースをプロセッサーに接続
      for (const source of sources) {
        source.connect(processor)
      }

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)

        // サンプルレート変換
        const resampledData = resampleAudio(inputData, actualSampleRate.current, TARGET_SAMPLE_RATE)

        // Float32をInt16に変換
        const int16Data = float32ToInt16(resampledData)

        // メインプロセスに送信
        window.electron.stt.sendAudio(int16Data.buffer)
        audioChunkCount.current++

        // 50チャンクごとにログ（約5秒ごと）
        if (audioChunkCount.current % 50 === 0) {
          log.debug(`Sent ${audioChunkCount.current} audio chunks`, { audioSource })
        }
      }

      processor.connect(audioContext.destination)

      setIsCapturing(true)
      log.info('Capture started successfully', {
        audioSource,
        streamCount: streams.length,
        sources: sources.length
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`音声キャプチャに失敗しました: ${message}`)
      log.error('Capture error', { error: message, audioSource })
      throw err
    }
  }, [audioSource, captureMicAudio, captureSystemAudio, mixAudioStreams])

  const stopCapture = useCallback(async () => {
    log.info('Stopping capture...')

    // プロセッサーを切断
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    // AudioContextを閉じる
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
      } catch (err) {
        log.error('Failed to close AudioContext', { error: String(err) })
      }
      audioContextRef.current = null
    }

    // マイクストリームを停止
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }

    // システム音声ストリームを停止
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach((track) => track.stop())
      systemStreamRef.current = null
    }

    log.info('Total chunks sent', { count: audioChunkCount.current, audioSource })
    setIsCapturing(false)
  }, [audioSource])

  return {
    isCapturing,
    error,
    audioSource,
    setAudioSource,
    startCapture,
    stopCapture,
  }
}
