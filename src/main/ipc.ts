import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import * as fs from 'fs/promises'
import { STTService, type TranscriptResult } from '../services/stt.service'
import { aiService, type AIResponse } from '../services/ai.service'
import { contextService } from '../services/context.service'
import { questionsService } from '../services/questions.service'
import { settingsService } from '../services/settings.service'
import { authService } from '../services/auth.service'
import { createLogger } from '../services/logger.service'
import type { DocumentType } from '../types/document'
import type { QuestionInput } from '../types/question'
import type { AppSettings, AudioSource } from '../types/settings'

const log = createLogger('IPC')

// 音声ソースごとに独立したSTT接続を管理
// 'both'モード: mic用とsystem用の2つの接続
// 'mic'/'system'モード: 単一接続
const sttServices = new Map<string, STTService>()
let sttUsingProxy = false
let currentAudioSource: AudioSource = 'system'
let currentAIAbortController: AbortController | null = null

export function setupIPC(mainWindow: BrowserWindow): void {
  log.info('Setting up IPC handlers')

  const API_BASE_URL = process.env.API_BASE_URL || 'https://api-kuriyama-natos-projects.vercel.app'

  // ウィンドウ操作
  ipcMain.handle('window:minimize', () => {
    mainWindow.minimize()
  })
  ipcMain.handle('window:maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })
  ipcMain.handle('window:close', () => {
    mainWindow.close()
  })
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow.isMaximized()
  })

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

  // 環境変数からAPIキーを取得（許可リスト制限）
  const ALLOWED_ENV_KEYS = new Set(['DEEPGRAM_API_KEY', 'API_BASE_URL', 'OPENAI_API_KEY'])
  ipcMain.handle('config:getApiKey', (_event: unknown, keyName: string) => {
    if (!ALLOWED_ENV_KEYS.has(keyName)) {
      log.warn(`config:getApiKey blocked access to ${keyName}`)
      return null
    }
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

  // ============================================
  // 音声キャプチャ関連のIPCハンドラー（Phase 6.5）
  // ============================================

  // 音声ソース設定
  ipcMain.handle('audio:setSource', (_event: unknown, source: AudioSource) => {
    log.info('audio:setSource called', { source })
    try {
      if (!['mic', 'system', 'both'].includes(source)) {
        return { success: false, error: `Invalid audio source: ${source}` }
      }
      settingsService.setSetting('audioSource', source)
      return { success: true }
    } catch (error) {
      log.error('Failed to set audio source', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 音声ソース取得
  ipcMain.handle('audio:getSource', () => {
    log.debug('audio:getSource called')
    try {
      const source = settingsService.getSetting('audioSource') || 'system'
      return { success: true, source }
    } catch (error) {
      log.error('Failed to get audio source', { error: String(error) })
      return { success: false, error: String(error), source: 'system' }
    }
  })

  // 音声認識開始（Phase 8: プロキシ経由で一時トークン取得 or カスタムキー直接接続）
  // 音声ソースに応じて1つまたは2つのSTT接続を作成
  ipcMain.handle('stt:start', async () => {
    log.info('stt:start called')
    try {
      // 現在の音声ソース設定を取得
      const audioSource = (settingsService.getSetting('audioSource') || 'system') as AudioSource
      currentAudioSource = audioSource

      // 必要なSTT接続のソースを決定
      const sources: ('mic' | 'system')[] =
        audioSource === 'both' ? ['mic', 'system'] : [audioSource as 'mic' | 'system']

      log.info('STT sources to connect', { audioSource, sources })

      // カスタムキーを確認（設定 → 環境変数の優先順位）
      const customKey = settingsService.getEffectiveApiKey('deepgram')

      let apiKey: string

      if (customKey) {
        // カスタムキーで直接接続
        apiKey = customKey
        sttUsingProxy = false
        log.info('Using custom Deepgram API key')
      } else {
        // プロキシ経由で一時トークンを取得
        log.info('Fetching temporary STT token from API proxy')
        const response = await authService.authenticatedFetch(
          `${API_BASE_URL}/api/stt/token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          if (response.status === 429) {
            return { success: false, error: 'STT usage limit exceeded. Please upgrade your plan.' }
          }
          return { success: false, error: errorData.error || 'Failed to get STT token' }
        }

        const tokenData = await response.json()

        if (tokenData.useCustomKey) {
          return { success: false, error: 'Custom API key required but not configured' }
        }

        apiKey = tokenData.token
        sttUsingProxy = true
        log.info('Temporary STT token obtained', { expiresIn: tokenData.expiresIn })
      }

      // 既存の接続をクリーンアップ
      for (const [key, service] of sttServices) {
        log.debug('Disconnecting existing service', { source: key })
        await service.disconnect()
      }
      sttServices.clear()

      // ソースごとにSTT接続を作成
      for (const source of sources) {
        log.debug('Creating STT service...', { source })
        const service = new STTService(apiKey)
        await service.connect((result: TranscriptResult) => {
          log.debug('Sending transcript to renderer', {
            textLength: result.text.length,
            isFinal: result.isFinal,
            source,
          })
          // 音声ソースをタグ付けしてレンダラーに送信
          mainWindow.webContents.send('stt:transcript', {
            ...result,
            source,
          })
        })
        sttServices.set(source, service)
      }

      log.info('STT connected successfully', { connections: sources.length })
      return { success: true }
    } catch (error) {
      log.error('Failed to start STT', { error: String(error) })
      // エラー時は部分的に接続したサービスをクリーンアップ
      for (const [, service] of sttServices) {
        try { await service.disconnect() } catch { /* cleanup */ }
      }
      sttServices.clear()
      return { success: false, error: String(error) }
    }
  })

  // 音声認識停止（Phase 8: プロキシ利用時は使用量を報告）
  // 複数接続がある場合はすべて停止し、合計使用量を報告
  ipcMain.handle('stt:stop', async () => {
    log.info('stt:stop called', { connections: sttServices.size })
    try {
      // 全接続の使用量を集計して停止
      let totalMinutes = 0
      for (const [source, service] of sttServices) {
        const minutes = service.getSessionMinutes()
        totalMinutes += minutes
        log.debug('Disconnecting STT service', { source, minutes })
        await service.disconnect()
      }
      sttServices.clear()

      // プロキシ利用時は合計使用量を報告（失敗しても停止をブロックしない）
      if (sttUsingProxy && totalMinutes > 0) {
        try {
          log.info('Reporting STT usage', { minutes: totalMinutes })
          const response = await authService.authenticatedFetch(
            `${API_BASE_URL}/api/stt/usage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ minutes: totalMinutes }),
            }
          )
          if (!response.ok) {
            log.warn('Failed to report STT usage', { status: response.status })
          } else {
            const usageData = await response.json()
            log.info('STT usage reported', { recorded: usageData.recorded, usage: usageData.usage })
          }
        } catch (usageError) {
          log.warn('STT usage report failed (non-blocking)', { error: String(usageError) })
        }
      }

      sttUsingProxy = false
      return { success: true }
    } catch (error) {
      log.error('Failed to stop STT', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 音声データ送信（preloadからnumber[]として送信される）
  // source パラメータで適切なSTT接続にルーティング
  let audioChunkCount = 0
  ipcMain.on('stt:audio', (_event, audioData: number[], source?: string) => {
    audioChunkCount++

    // ルーティング: sourceが指定されていればその接続へ、なければ単一接続を使用
    const targetSource = source || (currentAudioSource === 'both' ? undefined : currentAudioSource)
    const service = targetSource
      ? sttServices.get(targetSource)
      : sttServices.values().next().value // 単一接続のフォールバック

    if (audioChunkCount % 50 === 1) {
      log.debug('Audio chunk received', {
        chunk: audioChunkCount,
        size: audioData.length,
        source: targetSource,
        connected: service?.isConnected(),
      })
    }
    if (service && service.isConnected()) {
      // number[]をBufferに変換してDeepgramに送信
      const buffer = Buffer.from(audioData)
      service.send(buffer)
    } else if (audioChunkCount % 50 === 1) {
      log.warn('Audio received but STT not connected', { source: targetSource })
    }
  })

  // 接続状態確認（いずれかの接続がアクティブならtrue）
  ipcMain.handle('stt:status', () => {
    let connected = false
    for (const [, service] of sttServices) {
      if (service.isConnected()) {
        connected = true
        break
      }
    }
    log.debug(`stt:status called, connected: ${connected}, services: ${sttServices.size}`)
    return { connected }
  })

  // AI初期化（Phase 8: プロキシモード対応）
  ipcMain.handle('ai:init', async (_event: unknown, apiKey?: string) => {
    log.info('ai:init called')
    try {
      // カスタムキーを確認（引数 → 設定 → 環境変数の優先順位）
      const customKey = apiKey || settingsService.getEffectiveApiKey('openai')

      if (customKey) {
        // カスタムキーで直接接続
        aiService.initialize({ apiKey: customKey })
        log.info('AI service initialized with custom key')
      } else {
        // プロキシモードで初期化（APIキー不要）
        aiService.initialize({
          useProxy: true,
          apiBaseUrl: API_BASE_URL,
        })
        log.info('AI service initialized in proxy mode')
      }

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
        // 自動初期化を試みる（カスタムキー or プロキシモード）
        const customKey = settingsService.getEffectiveApiKey('openai')
        if (customKey) {
          aiService.initialize({ apiKey: customKey })
        } else {
          aiService.initialize({ useProxy: true, apiBaseUrl: API_BASE_URL })
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

  // AI生成を中断
  ipcMain.handle('ai:abort', () => {
    log.info('ai:abort called')
    if (currentAIAbortController) {
      currentAIAbortController.abort()
      currentAIAbortController = null
    }
    return { success: true }
  })

  // AIストリーム回答生成（Phase 8: プロキシ時はサーバー側でRAGコンテキスト取得）
  ipcMain.handle('ai:generateStream', async (_event, question: string, explicitContext?: string) => {
    log.info('ai:generateStream called', { questionLength: question.length })

    // 前回の生成を中断
    if (currentAIAbortController) {
      log.info('Aborting previous AI generation')
      currentAIAbortController.abort()
    }
    currentAIAbortController = new AbortController()
    const { signal } = currentAIAbortController

    try {
      if (!aiService.isInitialized()) {
        // 自動初期化（カスタムキー or プロキシモード）
        const customKey = settingsService.getEffectiveApiKey('openai')
        if (customKey) {
          log.info('AI auto-init with custom key')
          aiService.initialize({ apiKey: customKey })
        } else {
          log.info('AI auto-init with proxy mode')
          aiService.initialize({ useProxy: true, apiBaseUrl: API_BASE_URL })
        }
      }
      log.info('AI service config', {
        initialized: aiService.isInitialized(),
        useProxy: aiService.isUsingProxy(),
      })

      let contextString = explicitContext || ''

      // プロキシモード時はサーバー側でRAGコンテキストを取得するのでスキップ
      // 直接モード時は200msタイムアウトでコンテキスト取得（遅延防止）
      if (!aiService.isUsingProxy() && contextService.isInitialized()) {
        const RAG_TIMEOUT_MS = 200
        const contextPromise = contextService.getRelevantContext(question)
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), RAG_TIMEOUT_MS)
        )
        const contextResults = await Promise.race([contextPromise, timeoutPromise])

        if (contextResults && contextResults.length > 0) {
          const contextParts = contextResults.map((result) => {
            const labelMap: Record<string, string> = {
              resume: '履歴書',
              job_posting: '求人票',
              expected_qa: '想定質問',
            }
            const docLabel = labelMap[result.documentType] || result.documentType
            return `【${docLabel}: ${result.documentName}】\n${result.chunks.join('\n')}`
          })

          contextString =
            contextParts.join('\n\n') + (explicitContext ? `\n\n${explicitContext}` : '')

          log.debug('Context added to query', {
            documentsUsed: contextResults.length,
            contextLength: contextString.length,
          })
        } else if (!contextResults) {
          log.debug('RAG context fetch timed out, proceeding without context', {
            timeoutMs: RAG_TIMEOUT_MS,
          })
        }
      }

      const response = await aiService.generateStreamResponse(
        question,
        contextString || undefined,
        (chunk: string) => {
          if (!signal.aborted) {
            mainWindow.webContents.send('ai:chunk', chunk)
          }
        },
        signal
      )

      if (!signal.aborted) {
        log.info('Sending ai:complete to renderer', {
          answerLength: response.answer.length,
          answerPreview: response.answer.substring(0, 80),
          suggestions: response.suggestions.length,
        })
        mainWindow.webContents.send('ai:complete', response)
      }
      return { success: true, response }
    } catch (error) {
      const errorStr = String(error)
      if (signal.aborted || errorStr.includes('aborted')) {
        log.info('AI generation aborted (intentional)')
        return { success: false, error: 'aborted' }
      }
      log.error('Failed to generate AI stream response', { error: errorStr })
      mainWindow.webContents.send('ai:error', errorStr)
      return { success: false, error: errorStr }
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

  // ============================================
  // サブスクリプション関連のIPCハンドラー (Phase 7)
  // ============================================

  // サブスクリプション情報を取得
  ipcMain.handle('subscription:getPlans', async () => {
    log.info('subscription:getPlans called')
    try {
      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/api/subscription`
      )
      if (!response.ok) {
        const errorData = await response.json()
        return { success: false, error: errorData.error || 'Failed to fetch subscription' }
      }
      const data = await response.json()
      return { success: true, data }
    } catch (error) {
      log.error('Failed to get subscription plans', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // Stripe Checkout セッションを作成してブラウザで開く
  ipcMain.handle('subscription:checkout', async (_event, priceId: string) => {
    log.info('subscription:checkout called', { priceId })
    if (!priceId || typeof priceId !== 'string' || !priceId.startsWith('price_')) {
      return { success: false, error: 'Invalid priceId format' }
    }
    try {
      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/api/stripe/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priceId }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        return { success: false, error: errorData.error || 'Failed to create checkout session' }
      }

      const { url } = await response.json()
      if (url) {
        await shell.openExternal(url)
      }
      return { success: true }
    } catch (error) {
      log.error('Failed to create checkout', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // Stripe Customer Portal をブラウザで開く
  ipcMain.handle('subscription:portal', async () => {
    log.info('subscription:portal called')
    try {
      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/api/stripe/portal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      )

      if (!response.ok) {
        const errorData = await response.json()
        return { success: false, error: errorData.error || 'Failed to create portal session' }
      }

      const { url } = await response.json()
      if (url) {
        await shell.openExternal(url)
      }
      return { success: true }
    } catch (error) {
      log.error('Failed to open portal', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // サブスクリプション情報を更新（認証情報ごとリフレッシュ）
  ipcMain.handle('subscription:refresh', async () => {
    log.info('subscription:refresh called')
    try {
      const state = await authService.validateAndRefresh()
      return { success: true, data: state }
    } catch (error) {
      log.error('Failed to refresh subscription', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // ============================================
  // 想定質問関連のIPCハンドラー
  // ============================================

  ipcMain.handle('questions:list', async () => {
    log.debug('questions:list called')
    try {
      const questions = await questionsService.getQuestions()
      return { success: true, questions }
    } catch (error) {
      log.error('Failed to list questions', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('questions:save', async (_event, questions: QuestionInput[]) => {
    log.info('questions:save called', { count: questions.length })
    try {
      const saved = await questionsService.saveQuestions(questions)
      return { success: true, questions: saved }
    } catch (error) {
      log.error('Failed to save questions', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('questions:delete', async (_event, questionId: string) => {
    log.info('questions:delete called', { id: questionId })
    try {
      await questionsService.deleteQuestion(questionId)
      return { success: true }
    } catch (error) {
      log.error('Failed to delete question', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('questions:generate', async (_event, count?: number) => {
    log.info('questions:generate called', { count })
    try {
      const questions = await questionsService.generateQuestions(count)
      return { success: true, questions }
    } catch (error) {
      log.error('Failed to generate questions', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })
}
