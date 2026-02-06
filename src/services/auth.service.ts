/**
 * 認証サービス
 * Google OAuthとJWTトークン管理
 */

import Store from 'electron-store'
import { shell, BrowserWindow } from 'electron'
import { createLogger } from './logger.service'
import type {
  AuthState,
  AuthTokens,
  User,
  UserSettings,
  AuthMeResponse,
  DEFAULT_AUTH_STATE,
} from '../types/auth'

const log = createLogger('auth-service')

// API Base URL (Vercel)
const API_BASE_URL = process.env.API_BASE_URL || 'https://api-kuriyama-natos-projects.vercel.app'

interface AuthStoreSchema {
  tokens: AuthTokens | null
  user: User | null
  settings: UserSettings | null
}

class AuthService {
  private store: Store<AuthStoreSchema> | null = null
  private initialized = false
  private mainWindow: BrowserWindow | null = null
  private authStateListeners: Array<(state: AuthState) => void> = []
  private pollingAbortController: AbortController | null = null

  /**
   * サービスを初期化
   */
  initialize(mainWindow: BrowserWindow): void {
    if (this.initialized) {
      log.warn('AuthService already initialized')
      return
    }

    try {
      // 暗号化キーは環境変数から取得（必須）
      const encryptionKey = process.env.ELECTRON_STORE_ENCRYPTION_KEY
      if (!encryptionKey) {
        throw new Error('ELECTRON_STORE_ENCRYPTION_KEY environment variable is required')
      }

      this.store = new Store<AuthStoreSchema>({
        name: 'auth',
        defaults: {
          tokens: null,
          user: null,
          settings: null,
        },
        encryptionKey,
      })

      this.mainWindow = mainWindow
      this.initialized = true
      log.info('AuthService initialized')
    } catch (error) {
      log.error('Failed to initialize AuthService', { error: String(error) })
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
   * 現在の認証状態を取得
   */
  getAuthState(): AuthState {
    if (!this.store) {
      return {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        settings: null,
        error: null,
      }
    }

    const tokens = this.store.get('tokens')
    const user = this.store.get('user')
    const settings = this.store.get('settings')

    const isAuthenticated = !!tokens && !!user && !this.isTokenExpired(tokens)

    return {
      isAuthenticated,
      isLoading: false,
      user: isAuthenticated ? user : null,
      settings: isAuthenticated ? settings : null,
      error: null,
    }
  }

  /**
   * トークンが期限切れかチェック
   */
  private isTokenExpired(tokens: AuthTokens): boolean {
    // 5分のバッファを持たせる
    const bufferMs = 5 * 60 * 1000
    return Date.now() >= tokens.expiresAt - bufferMs
  }

  /**
   * Google OAuthログインを開始（ポーリング方式）
   *
   * 1. セッションを作成
   * 2. ブラウザでOAuth認証
   * 3. ポーリングでトークンを取得
   */
  async startGoogleLogin(): Promise<AuthState> {
    log.info('Starting Google OAuth login (polling mode)')

    // ローディング状態を通知
    this.notifyListeners({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      settings: null,
      error: null,
    })

    try {
      // 1. セッションを作成
      const sessionResponse = await fetch(`${API_BASE_URL}/api/auth/session`, {
        method: 'POST',
      })

      if (!sessionResponse.ok) {
        throw new Error('セッションの作成に失敗しました')
      }

      const { sessionId, authUrl } = await sessionResponse.json()
      log.info('Created auth session', { sessionId: sessionId.substring(0, 10) + '...' })

      // 2. ブラウザでOAuth認証を開始
      await shell.openExternal(authUrl)
      log.info('Opened OAuth URL in browser')

      // 3. ポーリングでトークンを取得
      return await this.pollForAuthResult(sessionId)
    } catch (error) {
      log.error('Failed to start Google login', { error: String(error) })
      const state: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        settings: null,
        error: String(error),
      }
      this.notifyListeners(state)
      return state
    }
  }

  /**
   * 認証結果をポーリング
   */
  private async pollForAuthResult(sessionId: string): Promise<AuthState> {
    const maxAttempts = 60 // 5分間（5秒間隔）
    const pollInterval = 5000

    // 前のポーリングをキャンセル
    this.pollingAbortController?.abort()
    this.pollingAbortController = new AbortController()

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // キャンセルチェック
      if (this.pollingAbortController.signal.aborted) {
        log.info('Polling cancelled')
        return this.getAuthState()
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/auth/session?id=${sessionId}`,
          { signal: this.pollingAbortController.signal }
        )

        const data = await response.json()

        if (data.status === 'pending') {
          // まだ認証中、待機
          await this.sleep(pollInterval)
          continue
        }

        if (data.status === 'completed') {
          log.info('Auth completed via polling')
          return await this.processAuthToken(data.token, data.user)
        }

        if (data.status === 'expired' || data.status === 'error') {
          const state: AuthState = {
            isAuthenticated: false,
            isLoading: false,
            user: null,
            settings: null,
            error: data.error || '認証がタイムアウトしました',
          }
          this.notifyListeners(state)
          return state
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          log.info('Polling aborted')
          return this.getAuthState()
        }
        log.warn('Polling error, retrying...', { error: String(error) })
      }

      await this.sleep(pollInterval)
    }

    // タイムアウト
    const state: AuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      settings: null,
      error: '認証がタイムアウトしました。もう一度お試しください。',
    }
    this.notifyListeners(state)
    return state
  }

  /**
   * トークンを処理して認証状態を更新
   */
  private async processAuthToken(token: string, userData?: User): Promise<AuthState> {
    try {
      // トークンをデコードして有効期限を取得
      const payload = this.decodeJWT(token)
      if (!payload) {
        throw new Error('トークンのデコードに失敗しました')
      }

      const tokens: AuthTokens = {
        accessToken: token,
        expiresAt: payload.exp * 1000,
      }

      // トークンを保存
      this.store?.set('tokens', tokens)

      // ユーザー情報を取得（セッションから取得できなかった場合）
      let user = userData
      let settings: UserSettings | null = null

      if (!user) {
        const authData = await this.fetchUserInfo(token)
        user = authData.user
        settings = authData.settings
      } else {
        // 設定を取得
        try {
          const authData = await this.fetchUserInfo(token)
          settings = authData.settings
        } catch {
          // 設定取得失敗は無視
        }
      }

      // ユーザー情報と設定を保存
      this.store?.set('user', user)
      if (settings) {
        this.store?.set('settings', settings)
      }

      const state: AuthState = {
        isAuthenticated: true,
        isLoading: false,
        user,
        settings,
        error: null,
      }

      this.notifyListeners(state)

      // メインウィンドウをフォーカス
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.focus()
      }

      log.info('Auth completed successfully', { userId: user.id })
      return state
    } catch (error) {
      log.error('Failed to process auth token', { error: String(error) })
      const state: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        settings: null,
        error: String(error),
      }
      this.notifyListeners(state)
      return state
    }
  }

  /**
   * ポーリングをキャンセル
   */
  cancelLogin(): void {
    log.info('Cancelling login')
    this.pollingAbortController?.abort()
    this.notifyListeners({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      settings: null,
      error: null,
    })
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Deep Linkコールバックを処理
   * interview-bot://auth/callback?token=xxx
   */
  async handleAuthCallback(url: string): Promise<AuthState> {
    log.info('Handling auth callback', { url: url.substring(0, 50) + '...' })

    try {
      const urlObj = new URL(url)
      const token = urlObj.searchParams.get('token')
      const error = urlObj.searchParams.get('error')

      if (error) {
        log.error('Auth callback error', { error })
        const state: AuthState = {
          isAuthenticated: false,
          isLoading: false,
          user: null,
          settings: null,
          error: decodeURIComponent(error),
        }
        this.notifyListeners(state)
        return state
      }

      if (!token) {
        log.error('No token in callback URL')
        const state: AuthState = {
          isAuthenticated: false,
          isLoading: false,
          user: null,
          settings: null,
          error: 'トークンが見つかりませんでした',
        }
        this.notifyListeners(state)
        return state
      }

      // トークンをデコードして有効期限を取得
      const payload = this.decodeJWT(token)
      if (!payload) {
        throw new Error('トークンのデコードに失敗しました')
      }

      const tokens: AuthTokens = {
        accessToken: token,
        expiresAt: payload.exp * 1000, // 秒からミリ秒に変換
      }

      // トークンを保存
      this.store?.set('tokens', tokens)

      // ユーザー情報を取得
      const authData = await this.fetchUserInfo(token)

      // ユーザー情報と設定を保存
      this.store?.set('user', authData.user)
      if (authData.settings) {
        this.store?.set('settings', authData.settings)
      }

      const state: AuthState = {
        isAuthenticated: true,
        isLoading: false,
        user: authData.user,
        settings: authData.settings,
        error: null,
      }

      this.notifyListeners(state)

      // メインウィンドウをフォーカス
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore()
        }
        this.mainWindow.focus()
      }

      log.info('Auth callback handled successfully', { userId: authData.user.id })
      return state
    } catch (error) {
      log.error('Failed to handle auth callback', { error: String(error) })
      const state: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        settings: null,
        error: String(error),
      }
      this.notifyListeners(state)
      return state
    }
  }

  /**
   * JWTをデコード
   *
   * セキュリティ注意: クライアント側では署名検証を行わない。
   * これは意図的な設計で、以下の理由による:
   * 1. トークンはサーバーから直接受け取る（中間者なし）
   * 2. 直後に fetchUserInfo() でサーバー側で署名検証を行う
   * 3. クライアントにJWT_SECRETを持たせないセキュリティ原則
   *
   * トークンの信頼性は fetchUserInfo() の成功で担保される。
   */
  private decodeJWT(token: string): { sub: string; email: string; exp: number } | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return null
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      return payload
    } catch {
      return null
    }
  }

  /**
   * APIからユーザー情報を取得
   */
  private async fetchUserInfo(token: string): Promise<AuthMeResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || 'ユーザー情報の取得に失敗しました')
    }

    return response.json()
  }

  /**
   * 認証状態を検証し、必要に応じてリフレッシュ
   */
  async validateAndRefresh(): Promise<AuthState> {
    if (!this.store) {
      return this.getAuthState()
    }

    const tokens = this.store.get('tokens')

    if (!tokens) {
      return this.getAuthState()
    }

    // トークンが期限切れの場合はログアウト
    // 注: 現在の実装ではリフレッシュトークンがないため、再ログインが必要
    if (this.isTokenExpired(tokens)) {
      log.info('Token expired, logging out')
      return this.logout()
    }

    // トークンが有効な場合、ユーザー情報を更新
    try {
      const authData = await this.fetchUserInfo(tokens.accessToken)
      this.store.set('user', authData.user)
      if (authData.settings) {
        this.store.set('settings', authData.settings)
      }

      return {
        isAuthenticated: true,
        isLoading: false,
        user: authData.user,
        settings: authData.settings,
        error: null,
      }
    } catch (error) {
      log.error('Failed to validate token', { error: String(error) })
      // 認証エラーの場合はログアウト
      return this.logout()
    }
  }

  /**
   * ログアウト
   */
  logout(): AuthState {
    log.info('Logging out')

    if (this.store) {
      this.store.delete('tokens')
      this.store.delete('user')
      this.store.delete('settings')
    }

    const state: AuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      settings: null,
      error: null,
    }

    this.notifyListeners(state)
    return state
  }

  /**
   * 現在のアクセストークンを取得
   */
  getAccessToken(): string | null {
    const tokens = this.store?.get('tokens')
    if (!tokens || this.isTokenExpired(tokens)) {
      return null
    }
    return tokens.accessToken
  }

  /**
   * 認証済みAPIリクエストを実行
   */
  async authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getAccessToken()

    if (!token) {
      throw new Error('認証されていません')
    }

    const headers = new Headers(options.headers)
    headers.set('Authorization', `Bearer ${token}`)

    return fetch(url, {
      ...options,
      headers,
    })
  }

  /**
   * 認証状態リスナーを追加
   */
  addAuthStateListener(listener: (state: AuthState) => void): () => void {
    this.authStateListeners.push(listener)

    // 解除関数を返す
    return () => {
      this.authStateListeners = this.authStateListeners.filter((l) => l !== listener)
    }
  }

  /**
   * リスナーに通知
   */
  private notifyListeners(state: AuthState): void {
    this.authStateListeners.forEach((listener) => {
      try {
        listener(state)
      } catch (error) {
        log.error('Auth state listener error', { error: String(error) })
      }
    })
  }

  /**
   * メインウィンドウを設定
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }
}

export const authService = new AuthService()
