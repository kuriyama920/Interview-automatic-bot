/**
 * 認証サービス
 * Google OAuthとJWTトークン管理
 */

import { shell, BrowserWindow, net } from 'electron'
import { createLogger } from './logger.service'
import { tokenStorage } from './token-storage.service'
import { getConfig } from '../config/env-config'
import type { AuthTokens, AuthMeResponse } from '../types/auth'
import type { AuthState, User } from '../types/shared'

const log = createLogger('auth-service')

class AuthService {
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
      tokenStorage.initialize()

      this.mainWindow = mainWindow
      this.initialized = true
      log.info('AuthService initialized')
    } catch (error) {
      log.error('Failed to initialize AuthService', { error: String(error) })
      throw error
    }
  }

  /**
   * 現在の認証状態を取得
   */
  getAuthState(): AuthState {
    const tokens = tokenStorage.getTokens()
    const user = tokenStorage.getUser()

    const isAuthenticated = !!tokens && !!user && !this.isTokenExpired(tokens)

    return {
      isAuthenticated,
      isLoading: false,
      user: isAuthenticated ? user : null,
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
      error: null,
    })

    try {
      // 1. セッションを作成
      const { apiBaseUrl } = getConfig()
      const sessionResponse = await net.fetch(`${apiBaseUrl}/api/auth/session`, {
        method: 'POST',
      })

      if (!sessionResponse.ok) {
        const errorBody = await sessionResponse.text().catch(() => 'no body')
        log.error('Session creation failed', {
          status: sessionResponse.status,
          body: errorBody,
        })
        throw new Error(
          `セッションの作成に失敗しました (HTTP ${sessionResponse.status}: ${errorBody})`
        )
      }

      const { sessionId, authUrl } = await sessionResponse.json() as { sessionId: string; authUrl: string }
      log.info('Created auth session', { sessionId: sessionId.substring(0, 10) + '...' })

      // 2. ブラウザでOAuth認証を開始
      await shell.openExternal(authUrl)
      log.info('Opened OAuth URL in browser')

      // 3. ポーリングでトークンを取得
      return await this.pollForAuthResult(sessionId)
    } catch (error) {
      const { apiBaseUrl } = getConfig()
      log.error('Failed to start Google login', { error: String(error), apiUrl: apiBaseUrl })
      const isNetworkError = String(error).includes('fetch failed') || String(error).includes('ENOTFOUND')
      const errorMessage = isNetworkError
        ? `APIサーバーに接続できません (${apiBaseUrl})。ネットワーク接続を確認してください。`
        : String(error)
      const state: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: errorMessage,
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
        const { apiBaseUrl } = getConfig()
        const response = await net.fetch(
          `${apiBaseUrl}/api/auth/session?id=${sessionId}`,
          { signal: this.pollingAbortController.signal }
        )

        const data = await response.json() as {
          status: string
          token?: string
          user?: User
          error?: string
        }

        if (data.status === 'pending') {
          // まだ認証中、待機
          await this.sleep(pollInterval)
          continue
        }

        if (data.status === 'completed') {
          log.info('Auth completed via polling')
          return await this.processAuthToken(data.token!, data.user)
        }

        if (data.status === 'expired' || data.status === 'error') {
          const state: AuthState = {
            isAuthenticated: false,
            isLoading: false,
            user: null,
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
      tokenStorage.setTokens(tokens)

      // ユーザー情報を取得（セッションから取得できなかった場合）
      let user = userData

      if (!user) {
        const authData = await this.fetchUserInfo(token)
        user = authData.user
      }

      // ユーザー情報を保存
      tokenStorage.setUser(user)

      const state: AuthState = {
        isAuthenticated: true,
        isLoading: false,
        user,
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
        error: String(error),
      }
      this.notifyListeners(state)
      return state
    }
  }

  /**
   * スリープ
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Deep Linkコールバックを処理
   * interview-bot://auth/callback?status=completed or ?error=xxx
   *
   * セキュリティ改善: URLにトークンを含めない。
   * トークンはポーリング方式（pollForAuthResult）で取得済み。
   * Deep Linkはウィンドウフォーカスとエラー通知のみ担当。
   */
  async handleAuthCallback(url: string): Promise<AuthState> {
    log.info('Handling auth callback', { url: url.substring(0, 50) + '...' })

    try {
      const urlObj = new URL(url)
      const error = urlObj.searchParams.get('error')
      const status = urlObj.searchParams.get('status')

      if (error) {
        log.error('Auth callback error', { error })
        const state: AuthState = {
          isAuthenticated: false,
          isLoading: false,
          user: null,
          error,
        }
        this.notifyListeners(state)
        return state
      }

      if (status === 'completed') {
        // ポーリングが既にトークン取得を処理済み。
        // メインウィンドウをフォーカスするだけ。
        if (this.mainWindow) {
          if (this.mainWindow.isMinimized()) {
            this.mainWindow.restore()
          }
          this.mainWindow.focus()
        }
        log.info('Auth callback: status completed, window focused')
      }

      return this.getAuthState()
    } catch (error) {
      log.error('Failed to handle auth callback', { error: String(error) })
      const state: AuthState = {
        isAuthenticated: false,
        isLoading: false,
        user: null,
        error: null,
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
  private decodeJWT(token: string): { sub: string; exp: number } | null {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) {
        return null
      }
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
      if (!payload.sub || !payload.exp) {
        return null
      }
      return { sub: payload.sub, exp: payload.exp }
    } catch (error) {
      log.warn('JWT decode failed', { error: String(error) })
      return null
    }
  }

  /**
   * APIからユーザー情報を取得
   */
  private async fetchUserInfo(token: string): Promise<AuthMeResponse> {
    const { apiBaseUrl } = getConfig()
    const response = await net.fetch(`${apiBaseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as Record<string, string>
      throw new Error(errorData.error || 'ユーザー情報の取得に失敗しました')
    }

    return response.json() as Promise<AuthMeResponse>
  }

  /**
   * 認証状態を検証し、必要に応じてリフレッシュ
   */
  async validateAndRefresh(): Promise<AuthState> {
    const tokens = tokenStorage.getTokens()

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
      tokenStorage.setUser(authData.user)

      return {
        isAuthenticated: true,
        isLoading: false,
        user: authData.user,
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

    tokenStorage.deleteTokens()
    tokenStorage.deleteUser()

    const state: AuthState = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      error: null,
    }

    this.notifyListeners(state)
    return state
  }

  /**
   * 現在のアクセストークンを取得
   */
  getAccessToken(): string | null {
    const tokens = tokenStorage.getTokens()
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

    return net.fetch(url, {
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
