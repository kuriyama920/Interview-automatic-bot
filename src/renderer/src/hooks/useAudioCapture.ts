import { useState, useCallback, useRef, useEffect } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('AudioCapture')

interface UseAudioCaptureReturn {
  isCapturing: boolean
  error: string | null
  audioSource: AudioSource
  setAudioSource: (source: AudioSource) => Promise<void>
  startCapture: () => Promise<void>
  stopCapture: () => Promise<void>
}

const TARGET_SAMPLE_RATE = 16000
const WORKLET_BUFFER_SIZE = 4096

// AudioWorkletProcessor のコード（インライン定義）
// オーディオスレッドで動作し、ScriptProcessorNodeのクラッシュ問題を回避
const AUDIO_WORKLET_CODE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._bufferSize = ${WORKLET_BUFFER_SIZE}
    this._buffer = new Float32Array(this._bufferSize)
    this._writeIndex = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true

    const channelData = input[0]
    if (!channelData) return true

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i]
      if (this._writeIndex >= this._bufferSize) {
        this.port.postMessage(this._buffer.slice(0))
        this._writeIndex = 0
      }
    }
    return true
  }
}
registerProcessor('audio-capture-processor', AudioCaptureProcessor)
`

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
  const [audioSource, setAudioSourceState] = useState<AudioSource>('system')

  // ストリーム参照
  const micStreamRef = useRef<MediaStream | null>(null)
  const systemStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodesRef = useRef<AudioWorkletNode[]>([])
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
      // getDisplayMediaにタイムアウトを設定（10秒）
      // ハングアップやChromiumレベルの応答不能を防止
      const displayMediaPromise = navigator.mediaDevices.getDisplayMedia({
        video: true,  // APIの仕様上必須
        audio: true,  // システム音声（loopbackで設定済み）
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('システム音声キャプチャがタイムアウトしました')), 10000)
      })

      const stream = await Promise.race([displayMediaPromise, timeoutPromise])

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

  // ソースごとにAudioWorkletを作成し、タグ付きで音声送信
  const createTaggedWorklet = useCallback((
    audioContext: AudioContext,
    stream: MediaStream,
    sourceTag: 'mic' | 'system',
  ): AudioWorkletNode => {
    const workletNode = new AudioWorkletNode(audioContext, 'audio-capture-processor')
    const audioSource = audioContext.createMediaStreamSource(stream)
    audioSource.connect(workletNode)

    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const inputData = e.data

      // サンプルレート変換
      const resampledData = resampleAudio(inputData, actualSampleRate.current, TARGET_SAMPLE_RATE)

      // Float32をInt16に変換
      const int16Data = float32ToInt16(resampledData)

      // ソースタグ付きでメインプロセスに送信
      window.electron.stt.sendAudio(int16Data.buffer as ArrayBuffer, sourceTag)
      audioChunkCount.current++

      // 100チャンクごとにログ
      if (audioChunkCount.current % 100 === 0) {
        log.debug(`Sent ${audioChunkCount.current} audio chunks`, { source: sourceTag })
      }
    }

    // destinationに接続してオーディオグラフを維持
    workletNode.connect(audioContext.destination)

    return workletNode
  }, [])

  const startCapture = useCallback(async () => {
    log.info('Starting capture...', { audioSource })
    try {
      setError(null)

      // 音声ソースに応じてストリームを取得
      // 途中で失敗した場合は取得済みストリームをクリーンアップ
      let micStream: MediaStream | null = null
      let systemStream: MediaStream | null = null

      try {
        if (audioSource === 'mic' || audioSource === 'both') {
          micStream = await captureMicAudio()
          micStreamRef.current = micStream
        }

        if (audioSource === 'system' || audioSource === 'both') {
          systemStream = await captureSystemAudio()
          systemStreamRef.current = systemStream
        }
      } catch (err) {
        // 部分的に取得したストリームをクリーンアップ
        log.warn('Cleaning up partially acquired streams due to error')
        if (micStream) micStream.getTracks().forEach(track => track.stop())
        if (systemStream) systemStream.getTracks().forEach(track => track.stop())
        micStreamRef.current = null
        systemStreamRef.current = null
        throw err
      }

      if (!micStream && !systemStream) {
        throw new Error('音声ソースが選択されていません')
      }

      // AudioContextを作成
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      actualSampleRate.current = audioContext.sampleRate
      log.debug('AudioContext created', {
        sampleRate: audioContext.sampleRate,
        targetSampleRate: TARGET_SAMPLE_RATE,
        audioSource,
      })

      // AudioWorkletプロセッサを登録
      const blob = new Blob([AUDIO_WORKLET_CODE], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)
      try {
        await audioContext.audioWorklet.addModule(workletUrl)
      } finally {
        URL.revokeObjectURL(workletUrl)
      }

      audioChunkCount.current = 0
      const nodes: AudioWorkletNode[] = []

      // ソースごとに独立したAudioWorkletを作成（話者分離のため）
      if (audioSource === 'both') {
        // 両方モード: マイクとシステム音声を別々のパイプラインで処理
        if (micStream) {
          const micNode = createTaggedWorklet(audioContext, micStream, 'mic')
          nodes.push(micNode)
          log.debug('Created mic AudioWorklet pipeline')
        }
        if (systemStream) {
          const systemNode = createTaggedWorklet(audioContext, systemStream, 'system')
          nodes.push(systemNode)
          log.debug('Created system AudioWorklet pipeline')
        }
      } else {
        // 単一ソースモード: 1つのパイプラインで処理
        const stream = micStream || systemStream
        const sourceTag = audioSource as 'mic' | 'system'
        if (stream) {
          const node = createTaggedWorklet(audioContext, stream, sourceTag)
          nodes.push(node)
        }
      }

      workletNodesRef.current = nodes

      setIsCapturing(true)
      log.info('Capture started successfully', {
        audioSource,
        pipelines: nodes.length,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const errorMessage = `音声キャプチャに失敗しました: ${message}`
      setError(errorMessage)
      log.error('Capture error', { error: message, audioSource })
      throw new Error(errorMessage)
    }
  }, [audioSource, captureMicAudio, captureSystemAudio, createTaggedWorklet])

  const stopCapture = useCallback(async () => {
    log.info('Stopping capture...')

    // すべてのワークレットノードを切断
    for (const node of workletNodesRef.current) {
      node.port.onmessage = null
      node.disconnect()
    }
    workletNodesRef.current = []

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
