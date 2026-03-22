import { ipcMain, BrowserWindow, dialog, shell } from 'electron'
import * as fs from 'fs/promises'
import { STTService, type TranscriptResult } from '../services/stt.service'
import { aiService } from '../services/ai.service'
import { interviewSession } from '../services/session.service'
import { contextService } from '../services/context.service'
import { questionsService } from '../services/questions.service'
import { authService } from '../services/auth.service'
import { createLogger } from '../services/logger.service'
import type {
  AIResponse,
  GenerateOptions,
  DocType as DocumentType,
  QuestionInput,
  InterviewProfile,
  AudioSource,
} from '../types/shared'

const log = createLogger('IPC')

/** Stripe の checkout/portal URL のみ外部ブラウザで開く（SSRF/任意URL防止） */
const ALLOWED_STRIPE_HOSTS = ['checkout.stripe.com', 'billing.stripe.com']
function isStripeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ALLOWED_STRIPE_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

// 音声ソースごとに独立したSTT接続を管理
// 'both'モード: mic用とsystem用の2つの接続
// 'mic'/'system'モード: 単一接続
const sttServices = new Map<string, STTService>()
let currentAudioSource: AudioSource = 'system'
let currentAIAbortController: AbortController | null = null

export function setupIPC(mainWindow: BrowserWindow): void {
  log.info('Setting up IPC handlers')

  const API_BASE_URL = process.env.API_BASE_URL || 'https://interview-bot-api.interviewautomaticbot92.workers.dev'

  /** Lazy-initialize AI service if not already initialized */
  function ensureAIInitialized(): void {
    if (!aiService.isInitialized()) {
      aiService.initialize({ apiBaseUrl: API_BASE_URL })
    }
  }

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

  // ============================================
  // 認証関連のIPCハンドラー
  // ============================================

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

  ipcMain.handle('auth:getToken', () => {
    try {
      const token = authService.getAccessToken()
      return { success: true, token }
    } catch (error) {
      log.error('Failed to get token', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  authService.addAuthStateListener((state) => {
    log.debug('Auth state changed, notifying renderer')
    mainWindow.webContents.send('auth:stateChanged', state)
  })

  // ============================================
  // 音声キャプチャ関連のIPCハンドラー（Phase 6.5）
  // ============================================

  ipcMain.handle('audio:setSource', (_event: unknown, source: AudioSource) => {
    log.info('audio:setSource called', { source })
    if (!['mic', 'system', 'both'].includes(source)) {
      return { success: false, error: `Invalid audio source: ${source}` }
    }
    currentAudioSource = source
    return { success: true }
  })

  ipcMain.handle('audio:getSource', () => {
    log.debug('audio:getSource called')
    return { success: true, source: currentAudioSource }
  })

  // 音声認識開始（プロキシ経由で一時トークン取得）
  ipcMain.handle('stt:start', async () => {
    log.info('stt:start called')
    try {
      interviewSession.startSession()
      audioChunkCount = 0
      const audioSource = currentAudioSource

      const sources: ('mic' | 'system')[] =
        audioSource === 'both' ? ['mic', 'system'] : [audioSource as 'mic' | 'system']

      log.info('STT sources to connect', { audioSource, sources })

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
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        log.error('STT token request failed', { status: response.status, error: errorData.error })
        if (response.status === 429) {
          return { success: false, error: errorData.error || '今月の音声認識の利用上限に達しました。プランをアップグレードするか、来月までお待ちください。' }
        }
        return { success: false, error: errorData.error || '音声認識の開始に失敗しました。' }
      }

      const tokenData = await response.json() as { token: string; expiresIn?: number }
      const apiKey = tokenData.token
      log.info('Temporary STT token obtained', { expiresIn: tokenData.expiresIn })

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
      for (const [, service] of sttServices) {
        try { await service.disconnect() } catch { /* cleanup */ }
      }
      sttServices.clear()
      return { success: false, error: String(error) }
    }
  })

  // 音声認識停止（使用量を報告）
  ipcMain.handle('stt:stop', async () => {
    log.info('stt:stop called', { connections: sttServices.size })
    interviewSession.endSession()
    try {
      let totalMinutes = 0
      for (const [source, service] of sttServices) {
        const minutes = service.getSessionMinutes()
        totalMinutes += minutes
        log.debug('Disconnecting STT service', { source, minutes })
        await service.disconnect()
      }
      sttServices.clear()

      // 使用量を報告（失敗しても停止をブロックしない）
      if (totalMinutes > 0) {
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
            const usageData = await response.json() as { recorded?: boolean; usage?: unknown }
            log.info('STT usage reported', { recorded: usageData.recorded, usage: usageData.usage })
          }
        } catch (usageError) {
          log.warn('STT usage report failed (non-blocking)', { error: String(usageError) })
        }
      }

      return { success: true }
    } catch (error) {
      log.error('Failed to stop STT', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // 音声データ送信
  let audioChunkCount = 0
  ipcMain.on('stt:audio', (_event, audioData: number[], source?: string) => {
    audioChunkCount++

    const targetSource = source || (currentAudioSource === 'both' ? undefined : currentAudioSource)
    const service = targetSource
      ? sttServices.get(targetSource)
      : sttServices.values().next().value

    if (audioChunkCount % 50 === 1) {
      log.debug('Audio chunk received', {
        chunk: audioChunkCount,
        size: audioData.length,
        source: targetSource,
        connected: service?.isConnected(),
      })
    }
    if (service && service.isConnected()) {
      const buffer = Buffer.from(audioData)
      service.send(buffer)
    } else if (audioChunkCount % 50 === 1) {
      log.warn('Audio received but STT not connected', { source: targetSource })
    }
  })

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

  // AI初期化（プロキシモード）
  ipcMain.handle('ai:init', async () => {
    log.info('ai:init called')
    try {
      aiService.initialize({ apiBaseUrl: API_BASE_URL })
      return { success: true }
    } catch (error) {
      log.error('Failed to initialize AI', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  // AI回答生成
  ipcMain.handle('ai:generate', async (_event: unknown, question: string, context?: string, options?: GenerateOptions) => {
    log.info('ai:generate called', { questionLength: question.length })
    try {
      ensureAIInitialized()
      const response: AIResponse = await aiService.generateResponse(question, context, options)
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

  // AIストリーム回答生成（サーバー側でプロフィール注入 + RAGコンテキスト取得）
  ipcMain.handle('ai:generateStream', async (_event, question: string, explicitContext?: string, options?: GenerateOptions) => {
    const ipcStartTime = Date.now()
    log.info('ai:generateStream called', { questionLength: question.length })

    if (currentAIAbortController) {
      log.info('Aborting previous AI generation')
      currentAIAbortController.abort()
    }
    currentAIAbortController = new AbortController()
    const { signal } = currentAIAbortController

    try {
      ensureAIInitialized()

      const response = await aiService.generateStreamResponse(
        question,
        explicitContext || undefined,
        {
          onChunk: (chunk: string) => {
            if (!signal.aborted) {
              mainWindow.webContents.send('ai:chunk', chunk)
            }
          },
          onPhase: (phase: string) => {
            if (!signal.aborted) {
              mainWindow.webContents.send('ai:phase', phase)
            }
          },
        },
        signal,
        options,
      )

      const totalMs = Date.now() - ipcStartTime
      if (!signal.aborted) {
        log.info('Sending ai:complete to renderer', {
          answerLength: response.answer.length,
          suggestions: response.suggestions.length,
          totalMs,
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

  // AIストリーム回答生成 v2（Speculative/Committed Lane分離）
  ipcMain.handle('ai:generateStreamV2', async (_event, question: string, explicitContext?: string, phase?: 'speculative' | 'committed', options?: GenerateOptions) => {
    const ipcStartTime = Date.now()
    const effectivePhase = phase ?? 'committed'
    log.info('ai:generateStreamV2 called', { questionLength: question.length, phase: effectivePhase })

    if (currentAIAbortController) {
      log.info('Aborting previous AI generation (v2)')
      currentAIAbortController.abort()
    }
    currentAIAbortController = new AbortController()
    const { signal } = currentAIAbortController

    try {
      ensureAIInitialized()

      const response = await aiService.generateStreamResponseV2(
        question,
        explicitContext || undefined,
        effectivePhase,
        {
          onChunk: (chunk: string) => {
            if (!signal.aborted) {
              mainWindow.webContents.send('ai:chunk', chunk)
            }
          },
          onPhase: (p: string) => {
            if (!signal.aborted) {
              mainWindow.webContents.send('ai:phase', p)
            }
          },
        },
        signal,
        options,
      )

      const totalMs = Date.now() - ipcStartTime
      if (!signal.aborted) {
        log.info('Sending ai:complete to renderer (v2)', {
          answerLength: response.answer.length,
          phase: effectivePhase,
          totalMs,
        })
        mainWindow.webContents.send('ai:complete', response)
      }
      return { success: true, response }
    } catch (error) {
      const errorStr = String(error)
      if (signal.aborted || errorStr.includes('aborted')) {
        log.info('AI v2 generation aborted (intentional)')
        return { success: false, error: 'aborted' }
      }
      log.error('Failed to generate AI stream v2 response', { error: errorStr })
      mainWindow.webContents.send('ai:error', errorStr)
      return { success: false, error: errorStr }
    }
  })

  // AI要約
  ipcMain.handle('ai:summarize', async (_event, previousSummary: unknown, interviewer: unknown, candidate: unknown) => {
    if (typeof interviewer !== 'string' || typeof candidate !== 'string') {
      return { success: false, error: 'Invalid input: interviewer and candidate must be strings' }
    }
    const safePreviousSummary = typeof previousSummary === 'string' ? previousSummary : ''
    // Worker側の上限に合わせたバリデーション（無駄なネットワーク往復を防止）
    const MAX_TURN_TEXT = 5000
    const MAX_SUMMARY_TEXT = 2000
    if (interviewer.length > MAX_TURN_TEXT || candidate.length > MAX_TURN_TEXT) {
      return { success: false, error: `Turn text exceeds maximum length of ${MAX_TURN_TEXT}` }
    }
    if (safePreviousSummary.length > MAX_SUMMARY_TEXT) {
      return { success: false, error: `Summary text exceeds maximum length of ${MAX_SUMMARY_TEXT}` }
    }

    log.debug('ai:summarize called', { interviewerLength: interviewer.length })
    try {
      ensureAIInitialized()
      const summary = await aiService.summarizeTurn(safePreviousSummary, interviewer, candidate)
      return { success: true, summary }
    } catch (error) {
      log.error('Failed to summarize turn', { error: String(error) })
      return { success: false, error: '要約生成に失敗しました' }
    }
  })

  // AIドキュメントコンテキスト事前取得（案3）
  ipcMain.handle('ai:prefetchContext', async () => {
    log.debug('ai:prefetchContext called')
    try {
      ensureAIInitialized()
      const context = await aiService.prefetchContext()
      return { success: true, context }
    } catch (error) {
      log.error('Failed to prefetch context', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('ai:isV2Available', () => {
    ensureAIInitialized()
    return { success: true, available: aiService.isV2Available() }
  })

  ipcMain.handle('ai:resetV2', () => {
    ensureAIInitialized()
    aiService.resetV2()
    return { success: true }
  })

  ipcMain.handle('ai:status', () => {
    return { initialized: aiService.isInitialized() }
  })

  // Context初期化
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

  // ドキュメントアップロード
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

      const MAX_FILE_SIZE = 10 * 1024 * 1024
      const stats = await fs.stat(filePath)
      if (stats.size > MAX_FILE_SIZE) {
        return { success: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` }
      }

      const fileBuffer = await fs.readFile(filePath)
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

  ipcMain.handle('document:list', async () => {
    try {
      const documents = await contextService.getDocuments()
      return { success: true, documents }
    } catch (error) {
      log.error('Failed to list documents', { error: String(error) })
      return { success: false, error: String(error), documents: [] }
    }
  })

  ipcMain.handle('document:remove', async (_event, documentId: string) => {
    if (!documentId || typeof documentId !== 'string' || !/^[a-f0-9-]{36}$/.test(documentId)) {
      return { success: false, error: 'Invalid document ID format' }
    }
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

  ipcMain.handle('subscription:getPlans', async () => {
    log.info('subscription:getPlans called')
    try {
      const response = await authService.authenticatedFetch(`${API_BASE_URL}/api/subscription`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        return { success: false, error: errorData.error || 'Failed to fetch subscription' }
      }
      const data = await response.json() as Record<string, unknown>
      return { success: true, data }
    } catch (error) {
      log.error('Failed to get subscription plans', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

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
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        return { success: false, error: errorData.error || 'Failed to create checkout session' }
      }
      const { url } = await response.json() as { url?: string }
      if (url && isStripeUrl(url)) {
        await shell.openExternal(url)
      } else if (url) {
        log.warn('Blocked non-Stripe URL from openExternal', { url })
      }
      return { success: true }
    } catch (error) {
      log.error('Failed to create checkout', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

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
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        return { success: false, error: errorData.error || 'Failed to create portal session' }
      }
      const { url } = await response.json() as { url?: string }
      if (url && isStripeUrl(url)) {
        await shell.openExternal(url)
      } else if (url) {
        log.warn('Blocked non-Stripe URL from openExternal', { url })
      }
      return { success: true }
    } catch (error) {
      log.error('Failed to open portal', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

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
  // プロフィール関連のIPCハンドラー
  // ============================================

  ipcMain.handle('profile:get', async () => {
    log.debug('profile:get called')
    try {
      const response = await authService.authenticatedFetch(`${API_BASE_URL}/api/auth/me`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        return { success: false, error: errorData.error || 'Failed to fetch profile' }
      }
      const data = await response.json() as { user: { interviewProfile?: InterviewProfile | null } }
      return { success: true, profile: data.user.interviewProfile || null }
    } catch (error) {
      log.error('Failed to get profile', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('profile:save', async (_event, profile: unknown) => {
    log.info('profile:save called')
    try {
      // 入力検証: オブジェクトであること、サイズ上限
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
        return { success: false, error: 'Profile must be an object' }
      }
      const serialized = JSON.stringify(profile)
      if (serialized.length > 50_000) {
        return { success: false, error: 'Profile data too large' }
      }
      const response = await authService.authenticatedFetch(
        `${API_BASE_URL}/api/auth/profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profile),
        }
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, string>
        return { success: false, error: errorData.error || 'Failed to save profile' }
      }
      const data = await response.json() as { interviewProfile?: InterviewProfile }

      void authService.validateAndRefresh().catch(() => {})

      return { success: true, interviewProfile: data.interviewProfile }
    } catch (error) {
      log.error('Failed to save profile', { error: String(error) })
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
    if (!Array.isArray(questions) || questions.length === 0 || questions.length > 200) {
      return { success: false, error: 'Invalid questions: must be an array with 1-200 items' }
    }
    for (const q of questions) {
      if (typeof q?.question !== 'string' || typeof q?.answer !== 'string') {
        return { success: false, error: 'Each question must have string question and answer fields' }
      }
      if (q.question.length > 2000 || q.answer.length > 10000) {
        return { success: false, error: 'Question or answer exceeds maximum length' }
      }
    }
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
    if (!questionId || typeof questionId !== 'string' || !/^[a-f0-9-]{36}$/.test(questionId)) {
      return { success: false, error: 'Invalid question ID format' }
    }
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
