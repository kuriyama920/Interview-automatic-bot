import { useState, useCallback, useEffect, useRef } from 'react'
import type { TranscriptResult } from '../types'
import { createLogger } from '../utils/logger'

const log = createLogger('useSTT')

interface UseSTTReturn {
  isConnected: boolean
  transcripts: TranscriptResult[]
  currentText: string
  currentSpeaker: number | undefined
  error: string | null
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  clearTranscripts: () => void
}

const MAX_TRANSCRIPTS = 1000 // メモリリーク防止のための上限

export function useSTT(): UseSTTReturn {
  const [isConnected, setIsConnected] = useState(false)
  const [transcripts, setTranscripts] = useState<TranscriptResult[]>([])
  const [currentText, setCurrentText] = useState('')
  const [currentSpeaker, setCurrentSpeaker] = useState<number | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const listenerSetup = useRef(false)

  useEffect(() => {
    mountedRef.current = true

    if (!listenerSetup.current) {
      log.debug('Setting up transcript listener')
      window.electron.stt.onTranscript((result: TranscriptResult) => {
        log.debug('Transcript received', {
          text: result.text,
          isFinal: result.isFinal,
          confidence: result.confidence,
        })
        // マウント状態をチェックして、アンマウント後の状態更新を防ぐ
        if (!mountedRef.current) {
          log.debug('Ignoring transcript - component unmounted')
          return
        }
        if (result.isFinal) {
          log.debug('Adding final transcript to list')
          setTranscripts((prev) => {
            const newTranscripts = [...prev, result]
            // メモリリーク防止: 上限を超えたら古いデータを削除
            if (newTranscripts.length > MAX_TRANSCRIPTS) {
              return newTranscripts.slice(-MAX_TRANSCRIPTS)
            }
            return newTranscripts
          })
          setCurrentText('')
          setCurrentSpeaker(undefined)
        } else {
          log.debug('Setting interim text')
          setCurrentText(result.text)
          setCurrentSpeaker(result.speaker)
        }
      })
      listenerSetup.current = true
    }

    return () => {
      log.debug('Cleanup - removing listener')
      mountedRef.current = false
      window.electron.stt.removeTranscriptListener()
      listenerSetup.current = false
    }
  }, [])

  const connect = useCallback(async () => {
    log.info('Connecting to Deepgram...')
    if (!mountedRef.current) return

    setError(null)
    const result = await window.electron.stt.start()
    log.debug('Connect result', { success: result.success })

    if (!mountedRef.current) return

    if (result.success) {
      log.info('Connected successfully')
      setIsConnected(true)
    } else {
      const errorMessage = result.error || '接続に失敗しました'
      log.error('Connection failed', { error: errorMessage })
      setError(errorMessage)
      throw new Error(errorMessage)
    }
  }, [])

  const disconnect = useCallback(async () => {
    log.info('Disconnecting...')
    try {
      await window.electron.stt.stop()
      if (mountedRef.current) {
        setIsConnected(false)
        setCurrentText('')
      }
    } catch (err) {
      log.error('Disconnect error:', err)
    }
  }, [])

  const clearTranscripts = useCallback(() => {
    setTranscripts([])
    setCurrentText('')
    setCurrentSpeaker(undefined)
  }, [])

  return {
    isConnected,
    transcripts,
    currentText,
    currentSpeaker,
    error,
    connect,
    disconnect,
    clearTranscripts,
  }
}
