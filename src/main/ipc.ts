import { ipcMain, BrowserWindow, dialog } from 'electron'
import * as fs from 'fs/promises'
import { STTService, type TranscriptResult } from '../services/stt.service'
import { aiService, type AIResponse } from '../services/ai.service'
import { contextService } from '../services/context.service'
import { settingsService } from '../services/settings.service'
import { authService } from '../services/auth.service'
import { createLogger } from '../services/logger.service'
import type { DocumentType } from '../types/document'
import type { AppSettings } from '../types/settings'

const log = createLogger('IPC')

let sttService: STTService | null = null

export function setupIPC(mainWindow: BrowserWindow): void {
  log.info('Setting up IPC handlers')

  // 設定サービスを初期化
  settingsService.initialize()

  // ============================================
  // 認証関連のIPCハンドラー
  // ============================================

  // 認証状態を取得
  ipcMain.handle('auth:getState', () => {
    log.debug('auth:getState called')
    try {
      const state = authService.getAuthState()
      return { success: true, state }
    } catch (error) {
      log.error('Failed to get auth state', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // Google OAuthログインを開始
  ipcMain.handle('auth:loginWithGoogle', async () => {
    log.info('auth:loginWithGoogle called')
    try {
      await authService.startGoogleLogin()
      return { success: true }
    } catch (error) {
      log.error('Failed to start Google login', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 認証状態を検証（起動時など）
  ipcMain.handle('auth:validate', async () => {
    log.info('auth:validate called')
    try {
      const state = await authService.validateAndRefresh()
      return { success: true, state }
    } catch (error) {
      log.error('Failed to validate auth', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // ログアウト
  ipcMain.handle('auth:logout', () => {
    log.info('auth:logout called')
    try {
      const state = authService.logout()
      return { success: true, state }
    } catch (error) {
      log.error('Failed to logout', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // アクセストークンを取得
  ipcMain.handle('auth:getToken', () => {
    try {
      const token = authService.getAccessToken()
      return { success: true, token }
    } catch (error) {
      log.error('Failed to get token', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 認証状態変更をRendererに通知
  authService.addAuthStateListener((state) => {
    log.debug('Auth state changed, notifying renderer')
    mainWindow.webContents.send('auth:stateChanged', state)
  })

  // ============================================
  // 環境変数・設定関連のIPCハンドラー
  // ============================================

  // 環境変数からAPIキーを取得
  ipcMain.handle('config:getApiKey', (_event: unknown, keyName: string) => {
    const value = process.env[keyName]
    log.debug(`config:getApiKey called for ${keyName}, found: ${!!value}`)
    return value || null
  })

  // 設定取得
  ipcMain.handle('settings:get', () => {
    log.debug('settings:get called')
    try {
      const settings = settingsService.getSettings()
      return { success: true, settings }
    } catch (error) {
      log.error('Failed to get settings', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 設定保存
  ipcMain.handle('settings:save', (_event: unknown, settings: Partial<AppSettings>) => {
    log.info('settings:save called', { keys: Object.keys(settings) })
    try {
      const newSettings = settingsService.saveSettings(settings)
      return { success: true, settings: newSettings }
    } catch (error) {
      log.error('Failed to save settings', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 設定リセット
  ipcMain.handle('settings:reset', () => {
    log.info('settings:reset called')
    try {
      const settings = settingsService.resetSettings()
      return { success: true, settings }
    } catch (error) {
      log.error('Failed to reset settings', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 有効なAPIキーを取得（設定優先、なければ環境変数）
  ipcMain.handle('settings:getEffectiveApiKey', (_event: unknown, keyType: 'deepgram' | 'openai') => {
    const key = settingsService.getEffectiveApiKey(keyType)
    return { success: true, key }
  })

  // 音声認識開始（APIキーは環境変数から直接取得 - セキュリティ向上）
  ipcMain.handle('stt:start', async () => {
    log.info('stt:start called')
    try {
      // APIキーをMain processで直接取得（Rendererを経由しない）
      const apiKey = process.env.DEEPGRAM_API_KEY
      if (!apiKey) {
        return { success: false, error: 'DEEPGRAM_API_KEY not configured in environment' }
      }

      if (sttService) {
        log.debug('Disconnecting existing service')
        await sttService.disconnect()
      }

      log.debug('Creating STT service...')
      sttService = new STTService(apiKey)
      await sttService.connect((result: TranscriptResult) => {
        log.debug('Sending transcript to renderer', { text: result.text })
        mainWindow.webContents.send('stt:transcript', result)
      })

      log.info('STT connected successfully')
      return { success: true }
    } catch (error) {
      log.error('Failed to start STT', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 音声認識停止
  ipcMain.handle('stt:stop', async () => {
    log.info('stt:stop called')
    try {
      if (sttService) {
        await sttService.disconnect()
        sttService = null
      }
      return { success: true }
    } catch (error) {
      log.error('Failed to stop STT', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 音声データ送信（preloadからnumber[]として送信される）
  let audioChunkCount = 0
  ipcMain.on('stt:audio', (_event, audioData: number[]) => {
    audioChunkCount++
    if (audioChunkCount % 50 === 1) {
      log.debug('Audio chunk received', {
        chunk: audioChunkCount,
        size: audioData.length,
        connected: sttService?.isConnected(),
      })
    }
    if (sttService && sttService.isConnected()) {
      // number[]をBufferに変換してDeepgramに送信
      const buffer = Buffer.from(audioData)
      sttService.send(buffer)
    } else if (audioChunkCount % 50 === 1) {
      log.warn('Audio received but STT not connected')
    }
  })

  // 接続状態確認
  ipcMain.handle('stt:status', () => {
    const connected = sttService?.isConnected() ?? false
    log.debug(`stt:status called, connected: ${connected}`)
    return { connected }
  })

  // AI初期化
  ipcMain.handle('ai:init', async (_event: unknown, apiKey?: string) => {
    log.info('ai:init called')
    try {
      const key = apiKey || process.env.OPENAI_API_KEY
      if (!key) {
        return { success: false, error: 'OpenAI API key not found' }
      }

      aiService.initialize({ apiKey: key })
      log.info('AI service initialized')
      return { success: true }
    } catch (error) {
      log.error('Failed to initialize AI', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // AI回答生成
  ipcMain.handle('ai:generate', async (_event: unknown, question: string, context?: string) => {
    log.info('ai:generate called', { questionLength: question.length })
    try {
      if (!aiService.isInitialized()) {
        // 自動初期化を試みる
        const key = process.env.OPENAI_API_KEY
        if (key) {
          aiService.initialize({ apiKey: key })
        } else {
          return { success: false, error: 'AI service not initialized' }
        }
      }

      const response: AIResponse = await aiService.generateResponse(question, context)
      log.info('AI response generated')
      return { success: true, response }
    } catch (error) {
      log.error('Failed to generate AI response', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // AIストリーム回答生成
  ipcMain.handle('ai:generateStream', async (_event, question: string, explicitContext?: string) => {
    log.info('ai:generateStream called', { questionLength: question.length })
    try {
      if (!aiService.isInitialized()) {
        const key = process.env.OPENAI_API_KEY
        if (key) {
          aiService.initialize({ apiKey: key })
        } else {
          return { success: false, error: 'AI service not initialized' }
        }
      }

      // Get relevant context from documents
      let contextString = explicitContext || ''

      if (contextService.isInitialized()) {
        const contextResults = await contextService.getRelevantContext(question)

        if (contextResults.length > 0) {
          const contextParts = contextResults.map((result) => {
            const docLabel = result.documentType === 'resume' ? '履歴書' : '求人票'
            return `【${docLabel}: ${result.documentName}】\n${result.chunks.join('\n')}`
          })

          contextString =
            contextParts.join('\n\n') + (explicitContext ? `\n\n${explicitContext}` : '')

          log.debug('Context added to query', {
            documentsUsed: contextResults.length,
            contextLength: contextString.length,
          })
        }
      }

      const response = await aiService.generateStreamResponse(
        question,
        contextString || undefined,
        (chunk: string) => {
          mainWindow.webContents.send('ai:chunk', chunk)
        }
      )

      mainWindow.webContents.send('ai:complete', response)
      log.info('AI stream response completed')
      return { success: true, response }
    } catch (error) {
      log.error('Failed to generate AI stream response', { error: String(error) })
      mainWindow.webContents.send('ai:error', String(error))
      return { success: false, error: String(error) }
    }
  })

  // AI状態確認
  ipcMain.handle('ai:status', () => {
    return { initialized: aiService.isInitialized() }
  })

  // Context初期化（Phase 6: APIキー不要 - サーバーサイドでEmbedding生成）
  ipcMain.handle('context:init', async () => {
    log.info('context:init called')
    try {
      await contextService.initialize()
      return { success: true }
    } catch (error) {
      log.error('Failed to initialize context service', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // ドキュメントアップロード（Phase 6: API経由でアップロード）
  ipcMain.handle('document:upload', async (_event, documentType: DocumentType) => {
    log.info('document:upload called', { type: documentType })
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Documents', extensions: ['pdf', 'docx'] }],
      })

      if (result.canceled || !result.filePaths[0]) {
        return { success: false, error: 'No file selected' }
      }

      const filePath = result.filePaths[0]
      const fileName = filePath.split(/[\\/]/).pop() || 'document'

      // Check file size before reading (10MB limit)
      const MAX_FILE_SIZE = 10 * 1024 * 1024
      const stats = await fs.stat(filePath)
      if (stats.size > MAX_FILE_SIZE) {
        return { success: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }
      }

      const fileBuffer = await fs.readFile(filePath)

      // Phase 6: Upload to API (server-side parsing and embedding)
      const document = await contextService.addDocument(fileBuffer, fileName, documentType)

      log.info('Document uploaded successfully', { id: document.id, name: fileName })
      return {
        success: true,
        document: {
          id: document.id,
          name: document.name,
          type: document.type,
          wordCount: document.totalTokens * 4,
          chunkCount: document.chunkCount,
        },
      }
    } catch (error) {
      log.error('Failed to upload document', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // ドキュメント一覧取得（Phase 6: API経由で取得）
  ipcMain.handle('document:list', async () => {
    try {
      const documents = await contextService.getDocuments()
      return { success: true, documents }
    } catch (error) {
      log.error('Failed to list documents', { error: String(error) })
      return { success: false, error: String(error), documents: [] }
    }
  })

  // ドキュメント削除
  ipcMain.handle('document:remove', async (_event, documentId: string) => {
    log.info('document:remove called', { id: documentId })
    try {
      await contextService.removeDocument(documentId)
      return { success: true }
    } catch (error) {
      log.error('Failed to remove document', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })
}
