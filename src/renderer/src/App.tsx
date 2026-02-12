/**
 * メインアプリケーションコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { useState, useEffect, useRef } from 'react'
import { useSTT } from './hooks/useSTT'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useAIResponse } from './hooks/useAIResponse'
import { useSettings } from './hooks/useSettings'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider, useToast } from './hooks/useToast'
import DocumentUploadPanel from './components/DocumentUploadPanel'
import InterviewQuestionsPanel from './components/InterviewQuestionsPanel'
import { SubscriptionModal } from './components/SubscriptionModal'
import { LoginPage } from './components/LoginPage'
import {
  Badge,
  Spinner,
  Avatar,
  WaveformVisualizer,
  ErrorAlert,
} from './components/ui'

// ============================================================
// カスタムタイトルバー
// ============================================================

import appIcon from './assets/icon.svg'

function TitleBar() {
  const handleMinimize = () => window.electron.window.minimize()
  const handleMaximize = () => window.electron.window.maximize()
  const handleClose = () => window.electron.window.close()

  return (
    <div className="flex items-center h-8 bg-surface border-b border-border/50 select-none drag-region shrink-0">
      {/* アプリアイコン + タイトル */}
      <div className="flex items-center gap-1.5 px-3">
        <img src={appIcon} alt="" className="w-4 h-4 no-drag" />
        <span className="text-[11px] font-medium text-content-secondary">Interview Bot</span>
      </div>

      {/* スペーサー */}
      <div className="flex-1" />

      {/* ウィンドウコントロール */}
      <div className="flex h-full no-drag">
        <button
          onClick={handleMinimize}
          className="w-11 h-full flex items-center justify-center hover:bg-surface-hover transition-colors"
          aria-label="最小化"
        >
          <svg className="w-3 h-3 text-content-secondary" viewBox="0 0 12 12">
            <rect x="1" y="5.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button
          onClick={handleMaximize}
          className="w-11 h-full flex items-center justify-center hover:bg-surface-hover transition-colors"
          aria-label="最大化"
        >
          <svg className="w-3 h-3 text-content-secondary" viewBox="0 0 12 12">
            <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          onClick={handleClose}
          className="w-11 h-full flex items-center justify-center hover:bg-red-500 hover:text-white text-content-secondary transition-colors"
          aria-label="閉じる"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12">
            <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ============================================================
// アイコンコンポーネント
// ============================================================

const LogoutIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
    />
  </svg>
)

const MicrophoneIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
    />
  </svg>
)

const SparklesIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
    />
  </svg>
)

const FolderIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
)

const ChevronLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
)

const AUDIO_SOURCE_LABELS = {
  mic: 'マイク',
  system: 'システム音声',
  both: 'マイク＋システム音声',
} as const

// ============================================================
// スケルトンコンポーネント
// ============================================================

function AIResponseSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="p-4 bg-surface-secondary rounded-lg">
        <div className="h-4 bg-surface-tertiary rounded w-1/4 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-surface-tertiary rounded w-full" />
          <div className="h-3 bg-surface-tertiary rounded w-5/6" />
          <div className="h-3 bg-surface-tertiary rounded w-4/6" />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// メインアプリコンテンツ
// ============================================================

function AppContent() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true)
  const [appError, setAppError] = useState<string | null>(null)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const lastProcessedIndex = useRef<number>(-1)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // 認証管理
  const { user, logout } = useAuth()

  // 設定管理
  const { settings } = useSettings()

  // トースト通知
  const toast = useToast()

  const {
    isConnected,
    transcripts,
    currentText,
    currentSource,
    error: sttError,
    connect,
    disconnect,
    clearTranscripts,
  } = useSTT()

  const { isCapturing, error: captureError, audioSource, setAudioSource, startCapture, stopCapture } = useAudioCapture()

  const {
    response: aiResponse,
    streamingText,
    isGenerating,
    error: aiError,
    generateStreamResponse,
    abortGeneration,
    clearResponse,
  } = useAIResponse()

  // ユーザーメニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 起動時に環境変数からAPIキーの存在確認
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await window.electron.config.getApiKey('DEEPGRAM_API_KEY')
        if (key) {
          setApiKey(key)
        } else {
          setAppError('.envファイルにDEEPGRAM_API_KEYを設定してください')
        }
      } catch {
        setAppError('APIキーの確認に失敗しました')
      } finally {
        setIsLoadingApiKey(false)
      }
    }
    checkApiKey()
  }, [])

  // interim（途中の文字起こし）からデバウンス付きでAI回答を先行生成
  // 面接官の発言（system音声）のみをトリガーとする
  const interimTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const INTERIM_DEBOUNCE_MS = 1500 // 1.5秒間テキストが安定したら生成開始
  const INTERIM_MIN_LENGTH = 15   // 最低15文字以上で生成開始

  useEffect(() => {
    if (!settings.autoGenerateAI) return
    if (!currentText || currentText.trim().length < INTERIM_MIN_LENGTH) return
    // 自分の発言（mic）ではAI生成しない
    if (currentSource === 'mic') return

    // デバウンス: 1.5秒間テキストが変わらなければAI生成開始
    interimTimerRef.current = setTimeout(() => {
      generateStreamResponse(currentText)
    }, INTERIM_DEBOUNCE_MS)

    return () => {
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current)
    }
  }, [currentText, currentSource, settings.autoGenerateAI, generateStreamResponse])

  // 確定文字起こしが来たら、interim生成を中断して確定テキストで再生成
  // 面接官の発言（system音声）のみをトリガーとする
  useEffect(() => {
    if (!settings.autoGenerateAI) return

    const newTranscripts = transcripts.slice(lastProcessedIndex.current + 1)
    if (newTranscripts.length === 0) return

    // 面接官の発言（system or sourceなし）のみフィルタリング
    const interviewerTranscripts = newTranscripts.filter((t) => t.source !== 'mic')
    if (interviewerTranscripts.length === 0) {
      // 自分の発言だけの場合はインデックスだけ進める
      lastProcessedIndex.current = transcripts.length - 1
      return
    }

    const latestText = interviewerTranscripts.map((t) => t.text).join(' ')
    if (latestText.trim().length > 10) {
      lastProcessedIndex.current = transcripts.length - 1
      // interim生成のタイマーをキャンセル
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current)
      // 確定テキストで（再）生成（内部で前回を自動abort）
      generateStreamResponse(latestText)
    }
  }, [transcripts, settings.autoGenerateAI, generateStreamResponse])

  const handleStart = async () => {
    if (!apiKey) {
      toast.error('.envファイルにDEEPGRAM_API_KEYを設定してください')
      return
    }

    setIsLoading(true)
    setAppError(null)
    lastProcessedIndex.current = -1
    clearResponse()

    try {
      await connect()
      await startCapture()
      toast.success('録音を開始しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : '予期しないエラーが発生しました'
      toast.error(message)
      try { await stopCapture() } catch { /* cleanup */ }
      try { await disconnect() } catch { /* cleanup */ }
    } finally {
      setIsLoading(false)
    }
  }

  const handleStop = async () => {
    setIsLoading(true)
    setAppError(null)

    try {
      await stopCapture()
      await disconnect()
      toast.info('録音を停止しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : '停止中にエラーが発生しました'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = () => {
    clearTranscripts()
    clearResponse()
    lastProcessedIndex.current = -1
    toast.info('クリアしました')
  }

  const error = appError || sttError || captureError || aiError

  // APIキー読み込み中
  if (isLoadingApiKey) {
    return (
      <div className="h-full bg-surface flex items-center justify-center" data-theme="interview-light">
        <div className="text-center space-y-4">
          <Spinner size="lg" className="text-accent mx-auto" />
          <p className="text-content-secondary">アプリケーションを初期化中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-surface-secondary overflow-hidden" data-theme="interview-light">
      {/* エラー表示 */}
      {error && (
        <div className="px-4 pt-2">
          <ErrorAlert error={error} onClose={() => setAppError(null)} />
        </div>
      )}

      {/* メインコンテンツ: 2カラム */}
      <div className="flex-1 flex overflow-hidden">
        {/* サイドバー（ドキュメント） */}
        <div
          className={`${
            showSidebar ? 'w-80' : 'w-0'
          } transition-all duration-300 overflow-hidden border-r border-border/50 bg-surface flex-shrink-0`}
        >
          <div className="w-80 h-full flex flex-col">
            <div className="p-3 border-b border-border/50 flex items-center justify-between">
              <span className="text-xs font-semibold text-content-secondary uppercase tracking-wider">資料管理</span>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 rounded-md hover:bg-surface-hover text-content-tertiary transition-colors"
              >
                <ChevronLeftIcon />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 p-2">
              <DocumentUploadPanel />
              <InterviewQuestionsPanel />
            </div>
          </div>
        </div>

        {/* 左パネル: 文字起こし */}
        <div className="flex-[5] flex flex-col min-w-0 border-r border-border/50">
          {/* 上部: ステータス + 録音コントロール */}
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* サイドバートグル */}
              {!showSidebar && (
                <button
                  onClick={() => setShowSidebar(true)}
                  className="p-1.5 rounded-lg hover:bg-surface-hover text-content-tertiary hover:text-content-secondary transition-colors"
                  title="資料管理"
                >
                  <FolderIcon />
                </button>
              )}

              {isCapturing ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-error" />
                  </span>
                  <span className="text-[11px] font-medium text-content-secondary">録音中</span>
                  <WaveformVisualizer isActive={isCapturing} barCount={10} className="ml-1" />
                </>
              ) : transcripts.length > 0 ? (
                <>
                  <span className="flex h-2 w-2">
                    <span className="inline-flex rounded-full h-2 w-2 bg-success" />
                  </span>
                  <span className="text-[11px] font-medium text-content-secondary">完了</span>
                </>
              ) : (
                <span className="text-[11px] text-content-tertiary">待機中</span>
              )}
            </div>

            {/* 録音ボタン */}
            <div className="flex items-center gap-2">
              {!isConnected ? (
                <button
                  onClick={handleStart}
                  disabled={!apiKey || isLoading}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-soft"
                >
                  {isLoading ? <Spinner size="sm" /> : <MicrophoneIcon />}
                  録音開始
                </button>
              ) : (
                <>
                  <button
                    onClick={handleClear}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-secondary rounded-lg hover:bg-surface-hover border border-border/50 transition-colors"
                  >
                    クリア
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={isLoading}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-error text-white text-xs font-medium rounded-lg hover:bg-error/90 disabled:opacity-50 transition-colors shadow-soft"
                  >
                    録音停止
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 文字起こし本文 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {transcripts.length === 0 && !currentText ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <MicrophoneIcon />
                  <p className="text-content-tertiary text-xs mt-2">
                    録音を開始すると、ここに文字起こしが表示されます
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {transcripts.map((t, i) => {
                  const prevSource = i > 0 ? transcripts[i - 1].source : undefined
                  const showLabel = t.source !== undefined && t.source !== prevSource
                  const isInterviewer = t.source === 'system'
                  return (
                    <div key={i}>
                      {showLabel && (
                        <div className={`text-[10px] font-semibold mb-1 ${
                          isInterviewer ? 'text-error' : 'text-accent'
                        }`}>
                          {isInterviewer ? '面接官' : 'あなた'}
                        </div>
                      )}
                      <p className="text-[13px] leading-relaxed text-content">{t.text}</p>
                    </div>
                  )
                })}
                {currentText && (
                  <div>
                    {(() => {
                      const lastSource = transcripts.length > 0
                        ? transcripts[transcripts.length - 1].source
                        : undefined
                      const showLabel = currentSource !== undefined && currentSource !== lastSource
                      const isInterviewer = currentSource === 'system'
                      return showLabel ? (
                        <div className={`text-[10px] font-semibold mb-1 ${
                          isInterviewer ? 'text-error' : 'text-accent'
                        }`}>
                          {isInterviewer ? '面接官' : 'あなた'}
                        </div>
                      ) : null
                    })()}
                    <p className="text-[13px] leading-relaxed text-content">
                      {currentText}
                      <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 animate-pulse" />
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 下部: 音声ソース */}
          <div className="px-5 py-2.5 border-t border-border/30 flex items-center justify-between">
            <div className="flex items-center gap-2 text-content-tertiary">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <span className="text-[10px]">{AUDIO_SOURCE_LABELS[audioSource]}</span>
            </div>
            {/* 音声ソース切り替え */}
            {!isCapturing && (
              <div className="flex items-center bg-surface-tertiary/50 rounded-md p-0.5">
                {(['system', 'mic', 'both'] as const).map((value) => (
                  <button
                    key={value}
                    onClick={() => setAudioSource(value)}
                    className={`px-2.5 py-1 text-[10px] rounded transition-all ${
                      audioSource === value
                        ? 'bg-surface text-accent shadow-sm font-medium'
                        : 'text-content-tertiary hover:text-content-secondary'
                    }`}
                  >
                    {value === 'system' ? 'システム' : value === 'mic' ? 'マイク' : '両方'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右パネル: AI回答 */}
        <div className="flex-[7] flex flex-col min-w-0 bg-accent/[0.02]">
          {/* 上部: タイトル + ステータス */}
          <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SparklesIcon />
              <span className="text-[11px] font-medium text-content-secondary">AI 回答提案</span>
            </div>
            <div className="flex items-center gap-2">
              {isGenerating ? (
                <span className="text-[10px] text-accent flex items-center gap-1.5 animate-pulse">
                  <Spinner size="sm" className="text-accent" />
                  生成中...
                </span>
              ) : aiResponse ? (
                <span className="text-[10px] text-success font-medium">完了</span>
              ) : null}

              {/* ユーザーメニュー */}
              <div className="relative ml-2" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="p-0.5 rounded-full hover:ring-2 hover:ring-accent/20 transition-all"
                >
                  <Avatar src={user?.picture} name={user?.name || user?.email} size="sm" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl border border-border shadow-modal animate-fade-in z-50">
                    <div className="p-3 border-b border-border">
                      <p className="text-sm font-medium text-content truncate">{user?.name || user?.email}</p>
                      <p className="text-xs text-content-secondary truncate">{user?.email}</p>
                      <Badge
                        variant={user?.subscriptionTier === 'free' ? 'default' : 'success'}
                        size="sm"
                        className="mt-2"
                      >
                        {user?.subscriptionTier === 'free' ? 'Free' : user?.subscriptionTier === 'pro' ? 'Pro' : 'Max'}
                      </Badge>
                    </div>
                    <div className="p-2 space-y-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false)
                          setShowSubscription(true)
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-content rounded-lg hover:bg-surface-hover transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        プラン管理
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false)
                          logout()
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-error rounded-lg hover:bg-error-subtle transition-colors"
                      >
                        <LogoutIcon />
                        ログアウト
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI回答本文 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {isGenerating && !streamingText ? (
              <AIResponseSkeleton />
            ) : !aiResponse && !streamingText ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <SparklesIcon />
                  <p className="text-content-tertiary text-xs mt-2">
                    面接官の質問に対するAI推奨回答がここに表示されます
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] text-content-secondary">おすすめの回答：</div>
                <p className="text-[13px] leading-relaxed text-content whitespace-pre-wrap font-medium">
                  {aiResponse?.answer || streamingText}
                  {isGenerating && streamingText && (
                    <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 animate-pulse" />
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* サブスクリプションモーダル (Phase 7) */}
      <SubscriptionModal
        isOpen={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
    </div>
  )
}

// ============================================================
// 認証コンテナ
// ============================================================

function AuthContainer() {
  const {
    isAuthenticated,
    isLoading: isAuthLoading,
    error: authError,
    loginWithGoogle,
  } = useAuth()

  // 認証状態読み込み中
  if (isAuthLoading) {
    return (
      <div className="h-full bg-surface flex items-center justify-center" data-theme="interview-light">
        <div className="text-center space-y-4">
          <Spinner size="lg" className="text-accent mx-auto" />
          <p className="text-content-secondary">認証状態を確認中...</p>
        </div>
      </div>
    )
  }

  // 未認証
  if (!isAuthenticated) {
    return <LoginPage onLogin={loginWithGoogle} isLoading={isAuthLoading} error={authError} />
  }

  // 認証済み
  return <AppContent />
}

// ============================================================
// App（エントリーポイント）
// ============================================================

function App() {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <ToastProvider>
          <AuthProvider>
            <AuthContainer />
          </AuthProvider>
        </ToastProvider>
      </div>
    </div>
  )
}

export default App
