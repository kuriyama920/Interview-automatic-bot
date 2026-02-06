/**
 * 設定管理用カスタムフック
 */

import { useState, useCallback, useEffect } from 'react'

// 音声ソースの種類
export type AudioSource = 'mic' | 'system' | 'both'

export interface AppSettings {
  deepgramApiKey: string
  openaiApiKey: string
  theme: 'dark' | 'light'
  autoGenerateAI: boolean
  audioSource: AudioSource
  aiModel: 'gpt-5-mini' | 'gpt-5' | 'gpt-4o'
  aiTemperature: number
  aiMaxTokens: number
  contextMinSimilarity: number
  contextTopK: number
  lastUpdated: number
  version: string
}

const DEFAULT_SETTINGS: AppSettings = {
  deepgramApiKey: '',
  openaiApiKey: '',
  theme: 'dark',
  autoGenerateAI: true,
  audioSource: 'mic',
  aiModel: 'gpt-5-mini',
  aiTemperature: 0.7,
  aiMaxTokens: 1000,
  contextMinSimilarity: 0.7,
  contextTopK: 3,
  lastUpdated: Date.now(),
  version: '1.0.0',
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 設定を読み込み
  const loadSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electron.settings.get()
      if (result.success && result.settings) {
        setSettings(result.settings)
      } else {
        setError(result.error || '設定の読み込みに失敗しました')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の読み込みに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 設定を保存
  const saveSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electron.settings.save(newSettings)
      if (result.success && result.settings) {
        setSettings(result.settings)
        return true
      } else {
        setError(result.error || '設定の保存に失敗しました')
        return false
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定の保存に失敗しました')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 設定をリセット
  const resetSettings = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await window.electron.settings.reset()
      if (result.success && result.settings) {
        setSettings(result.settings)
        return true
      } else {
        setError(result.error || '設定のリセットに失敗しました')
        return false
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '設定のリセットに失敗しました')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 初回読み込み
  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  return {
    settings,
    isLoading,
    error,
    loadSettings,
    saveSettings,
    resetSettings,
  }
}
