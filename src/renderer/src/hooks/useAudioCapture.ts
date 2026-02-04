import { useState, useCallback, useRef } from 'react'
import { createLogger } from '../utils/logger'

const log = createLogger('AudioCapture')

interface UseAudioCaptureReturn {
  isCapturing: boolean
  error: string | null
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
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const audioChunkCount = useRef(0)
  const actualSampleRate = useRef<number>(0)

  const startCapture = useCallback(async () => {
    log.info('Starting capture...')
    try {
      setError(null)

      // マイク音声を取得（ブラウザのデフォルトサンプルレートを使用）
      log.debug('Requesting microphone access...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      log.info('Microphone access granted')

      mediaStreamRef.current = stream

      // AudioContextを作成（ブラウザのデフォルトサンプルレートを使用）
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      actualSampleRate.current = audioContext.sampleRate
      log.debug('AudioContext created', {
        sampleRate: audioContext.sampleRate,
        targetSampleRate: TARGET_SAMPLE_RATE,
        resamplingRatio: audioContext.sampleRate / TARGET_SAMPLE_RATE,
      })

      const source = audioContext.createMediaStreamSource(stream)

      // ScriptProcessorNodeで音声データを取得
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      audioChunkCount.current = 0

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
          log.debug(`Sent ${audioChunkCount.current} audio chunks`)
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      setIsCapturing(true)
      log.info('Capture started successfully')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(`マイクへのアクセスに失敗しました: ${message}`)
      log.error('Capture error', { error: message })
      throw err
    }
  }, [])

  const stopCapture = useCallback(async () => {
    log.info('Stopping capture...')
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close()
      } catch (err) {
        log.error('Failed to close AudioContext', { error: String(err) })
      }
      audioContextRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    log.info('Total chunks sent', { count: audioChunkCount.current })
    setIsCapturing(false)
  }, [])

  return {
    isCapturing,
    error,
    startCapture,
    stopCapture,
  }
}
