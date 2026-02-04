/**
 * 設定管理サービス
 * electron-storeを使用した永続化設定管理
 */

import Store from 'electron-store'
import { createLogger } from './logger.service'
import { AppSettings, DEFAULT_SETTINGS, SettingsKey } from '../types/settings'

const log = createLogger('settings-service')

interface StoreSchema {
  settings: AppSettings
}

class SettingsService {
  private store: Store<StoreSchema> | null = null
  private initialized = false

  /**
   * サービスを初期化
   */
  initialize(): void {
    if (this.initialized) {
      log.warn('SettingsService already initialized')
      return
    }

    try {
      this.store = new Store<StoreSchema>({
        name: 'settings',
        defaults: {
          settings: DEFAULT_SETTINGS,
        },
        encryptionKey: 'interview-bot-settings-key',
      })

      this.initialized = true
      log.info('SettingsService initialized')
    } catch (error) {
      log.error('Failed to initialize SettingsService', { error: String(error) })
      throw error
    }
  }

  /**
   * 初期化状態を確認
   */
  isInitialized(): boolean {
    return this.initialized
  }

  /**
   * 全設定を取得
   */
  getSettings(): AppSettings {
    if (!this.store) {
      log.warn('Store not initialized, returning defaults')
      return DEFAULT_SETTINGS
    }

    const settings = this.store.get('settings', DEFAULT_SETTINGS)
    return { ...DEFAULT_SETTINGS, ...settings }
  }

  /**
   * 特定の設定を取得
   */
  getSetting<K extends SettingsKey>(key: K): AppSettings[K] {
    const settings = this.getSettings()
    return settings[key]
  }

  /**
   * 全設定を保存
   */
  saveSettings(settings: Partial<AppSettings>): AppSettings {
    if (!this.store) {
      throw new Error('Store not initialized')
    }

    const currentSettings = this.getSettings()
    const newSettings: AppSettings = {
      ...currentSettings,
      ...settings,
      lastUpdated: Date.now(),
    }

    this.store.set('settings', newSettings)
    log.info('Settings saved', { updatedKeys: Object.keys(settings) })

    return newSettings
  }

  /**
   * 特定の設定を保存
   */
  setSetting<K extends SettingsKey>(key: K, value: AppSettings[K]): AppSettings {
    return this.saveSettings({ [key]: value })
  }

  /**
   * 設定をデフォルトにリセット
   */
  resetSettings(): AppSettings {
    if (!this.store) {
      throw new Error('Store not initialized')
    }

    const resetSettings: AppSettings = {
      ...DEFAULT_SETTINGS,
      lastUpdated: Date.now(),
    }

    this.store.set('settings', resetSettings)
    log.info('Settings reset to defaults')

    return resetSettings
  }

  /**
   * 有効なAPIキーを取得（設定優先、なければ環境変数）
   */
  getEffectiveApiKey(keyType: 'deepgram' | 'openai'): string | null {
    const settings = this.getSettings()

    if (keyType === 'deepgram') {
      return settings.deepgramApiKey || process.env.DEEPGRAM_API_KEY || null
    }

    if (keyType === 'openai') {
      return settings.openaiApiKey || process.env.OPENAI_API_KEY || null
    }

    return null
  }
}

export const settingsService = new SettingsService()
