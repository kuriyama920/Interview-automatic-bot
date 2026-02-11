/**
 * メインアプリケーションコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSTT } from './hooks/useSTT'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useAIResponse } from './hooks/useAIResponse'
import { useSettings } from './hooks/useSettings'
import { useAuth } from './hooks/useAuth'
import { ToastProvider, useToast } from './hooks/useToast'
import DocumentUploadPanel from './components/DocumentUploadPanel'
import InterviewQuestionsPanel from './components/InterviewQuestionsPanel'
import { SettingsModal } from './components/SettingsModal'
import { SubscriptionModal } from './components/SubscriptionModal'
import { LoginPage } from './components/LoginPage'
import {
  Card,
  CardHeader,
  Button,
  IconButton,
  Badge,
  Alert,
  Spinner,
  Avatar,
  Toggle,
  WaveformVisualizer,
} from './components/ui'

// ============================================================
// アイコンコンポーネント
// ============================================================

const SettingsIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
)

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

const StopIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
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

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
)

const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
)

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
  const [isTestMode, setIsTestMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showSubscription, setShowSubscription] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastProcessedIndex = useRef<number>(-1)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // 認証管理
  const { user, logout } = useAuth()

  // 設定管理
  const { settings, saveSettings, resetSettings } = useSettings()

  // トースト通知
  const toast = useToast()

  const {
    isConnected,
    transcripts,
    currentText,
    error: sttError,
    connect,
    disconnect,
    clearTranscripts,
  } = useSTT()

  const { isCapturing, error: captureError, startCapture, stopCapture } = useAudioCapture()

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
  const interimTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const INTERIM_DEBOUNCE_MS = 1500 // 1.5秒間テキストが安定したら生成開始
  const INTERIM_MIN_LENGTH = 15   // 最低15文字以上で生成開始

  useEffect(() => {
    if (!settings.autoGenerateAI) return
    if (!currentText || currentText.trim().length < INTERIM_MIN_LENGTH) return

    // デバウンス: 1.5秒間テキストが変わらなければAI生成開始
    interimTimerRef.current = setTimeout(() => {
      generateStreamResponse(currentText)
    }, INTERIM_DEBOUNCE_MS)

    return () => {
      if (interimTimerRef.current) clearTimeout(interimTimerRef.current)
    }
  }, [currentText, settings.autoGenerateAI, generateStreamResponse])

  // 確定文字起こしが来たら、interim生成を中断して確定テキストで再生成
  useEffect(() => {
    if (!settings.autoGenerateAI) return

    const newTranscripts = transcripts.slice(lastProcessedIndex.current + 1)
    if (newTranscripts.length === 0) return

    const latestText = newTranscripts.map((t) => t.text).join(' ')
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

  // テストモード: 音声ファイルをアップロードして送信
  const handleTestFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !apiKey) return

    setIsLoading(true)
    setAppError(null)
    setIsTestMode(true)
    lastProcessedIndex.current = -1
    clearResponse()

    toast.info(`テストファイルを処理中: ${file.name}`)

    try {
      await connect()

      const arrayBuffer = await file.arrayBuffer()
      const audioData = new Uint8Array(arrayBuffer)

      const chunkSize = 4096
      for (let i = 0; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, i + chunkSize)
        window.electron.stt.sendAudio(chunk.buffer)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
      await disconnect()
      toast.success('テストファイルの処理が完了しました')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'テスト中にエラーが発生しました'
      toast.error(message)
      await disconnect()
    } finally {
      setIsLoading(false)
      setIsTestMode(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 手動でAI回答を生成
  const handleManualGenerate = useCallback(() => {
    const allText = transcripts.map((t) => t.text).join(' ')
    if (allText.trim()) {
      generateStreamResponse(allText)
    }
  }, [transcripts, generateStreamResponse])

  const handleClear = () => {
    clearTranscripts()
    clearResponse()
    lastProcessedIndex.current = -1
    toast.info('クリアしました')
  }

  // 設定保存のラッパー
  const handleSaveSettings = async (newSettings: Parameters<typeof saveSettings>[0]) => {
    const result = await saveSettings(newSettings)
    if (result) {
      toast.success('設定を保存しました')
    }
    return result
  }

  // 設定リセットのラッパー
  const handleResetSettings = async () => {
    const result = await resetSettings()
    if (result) {
      toast.info('設定をリセットしました')
    }
    return result
  }

  const error = appError || sttError || captureError || aiError

  // APIキー読み込み中
  if (isLoadingApiKey) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center" data-theme="interview-light">
        <div className="text-center space-y-4">
          <Spinner size="lg" className="text-accent mx-auto" />
          <p className="text-content-secondary">アプリケーションを初期化中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary" data-theme="interview-light">
      {/* ヘッダー */}
      <header className="sticky top-0 z-50 bg-translucent-white backdrop-blur-glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* 左側: ロゴ */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <MicrophoneIcon />
            </div>
            <h1 className="text-lg font-semibold text-content">Interview Bot</h1>
            <Badge variant="info" size="sm">Phase 7</Badge>
          </div>

          {/* 右側: アクション */}
          <div className="flex items-center gap-2">
            <IconButton
              icon={<SettingsIcon />}
              label="設定"
              onClick={() => setShowSettings(true)}
            />

            {/* ユーザーメニュー */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <Avatar src={user?.picture} name={user?.name || user?.email} size="sm" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-surface rounded-xl border border-border shadow-modal animate-fade-in">
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
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto p-4 space-y-4">
        {/* コントロールパネル */}
        <Card variant="default" padding="md">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* ステータスバッジ */}
            <div className="flex items-center gap-2">
              <Badge variant={isConnected ? 'success' : 'default'}>
                {isConnected ? '接続中' : '未接続'}
              </Badge>
              <Badge variant={isCapturing ? 'success' : 'default'}>
                {isCapturing ? '録音中' : '停止'}
              </Badge>
              {isTestMode && <Badge variant="warning">テスト中</Badge>}
              {isGenerating && <Badge variant="info">AI生成中</Badge>}
            </div>

            {/* コントロールボタン */}
            <div className="flex items-center gap-2">
              {!isConnected && !isTestMode ? (
                <>
                  <Button
                    variant="primary"
                    leftIcon={<MicrophoneIcon />}
                    onClick={handleStart}
                    disabled={!apiKey || isLoading}
                    isLoading={isLoading}
                  >
                    録音開始
                  </Button>
                  <label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*,.wav,.mp3,.webm,.ogg"
                      className="hidden"
                      onChange={handleTestFile}
                      disabled={!apiKey || isLoading}
                    />
                    <Button
                      as="span"
                      variant="secondary"
                      leftIcon={<UploadIcon />}
                      className="cursor-pointer"
                    >
                      テスト
                    </Button>
                  </label>
                </>
              ) : isConnected ? (
                <Button
                  variant="danger"
                  leftIcon={<StopIcon />}
                  onClick={handleStop}
                  disabled={isLoading}
                  isLoading={isLoading}
                >
                  録音停止
                </Button>
              ) : null}

              {transcripts.length > 0 && (
                <>
                  <Button
                    variant="primary"
                    leftIcon={<SparklesIcon />}
                    onClick={handleManualGenerate}
                    disabled={isLoading || isGenerating}
                    isLoading={isGenerating}
                  >
                    AI回答生成
                  </Button>
                  <IconButton
                    icon={<TrashIcon />}
                    variant="secondary"
                    label="クリア"
                    onClick={handleClear}
                    disabled={isLoading}
                  />
                </>
              )}
            </div>
          </div>

          {/* 自動生成トグル */}
          <div className="mt-4 pt-4 border-t border-border">
            <Toggle
              checked={settings.autoGenerateAI}
              onChange={(checked) => saveSettings({ autoGenerateAI: checked })}
              label="文字起こし後に自動でAI回答を生成"
            />
          </div>
        </Card>

        {/* エラー表示 */}
        {error && (
          <Alert variant="error" onClose={() => setAppError(null)}>
            {error}
          </Alert>
        )}

        {/* メインコンテンツ: 3カラムレイアウト */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* コンテキスト設定 (サイドバー) */}
          <div className="lg:col-span-3 space-y-4">
            <DocumentUploadPanel />
            <InterviewQuestionsPanel />
          </div>

          {/* 文字起こし結果 */}
          <div className="lg:col-span-4">
            <Card variant="default" padding="none" className="h-full">
              <div className="p-4 border-b border-border">
                <CardHeader
                  title="文字起こし"
                  subtitle="面接官の質問"
                  className="mb-0"
                />
              </div>

              {/* 音声波形 */}
              {isCapturing && (
                <div className="px-4 py-3 bg-accent-subtle border-b border-border">
                  <WaveformVisualizer isActive={isCapturing} />
                </div>
              )}

              <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                {transcripts.length === 0 && !currentText ? (
                  <p className="text-content-tertiary text-center py-8">
                    録音を開始すると、ここに文字起こしが表示されます
                  </p>
                ) : (
                  <div className="space-y-3">
                    {transcripts.map((t, i) => (
                      <div key={i} className="p-3 bg-surface-secondary rounded-lg">
                        <p className="text-sm text-content">{t.text}</p>
                        <p className="text-xs text-content-tertiary mt-1">
                          確信度: {(t.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                    {currentText && (
                      <div className="p-3 bg-accent-subtle rounded-lg border border-accent/20">
                        <p className="text-sm text-accent animate-pulse-subtle">{currentText}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* AI回答 */}
          <div className="lg:col-span-5">
            <Card variant="default" padding="none" className="h-full">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <CardHeader
                  title="AI推奨回答"
                  className="mb-0"
                />
                {isGenerating && <Spinner size="sm" className="text-accent" />}
              </div>

              <div className="p-4 min-h-[300px] max-h-[500px] overflow-y-auto">
                {isGenerating && !streamingText ? (
                  <AIResponseSkeleton />
                ) : !aiResponse && !streamingText ? (
                  <p className="text-content-tertiary text-center py-8">
                    面接官の質問に対するAI推奨回答がここに表示されます
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* メイン回答 */}
                    <div className="p-4 bg-success-subtle rounded-lg border border-success/20">
                      <h4 className="text-sm font-medium text-success-text mb-2">回答例</h4>
                      <p className="text-sm text-content whitespace-pre-wrap">
                        {aiResponse?.answer || streamingText}
                      </p>
                    </div>

                    {/* 補足ポイント */}
                    {aiResponse?.suggestions && aiResponse.suggestions.length > 0 && (
                      <div className="p-4 bg-info-subtle rounded-lg border border-info/20">
                        <h4 className="text-sm font-medium text-info-text mb-2">補足ポイント</h4>
                        <ul className="text-sm text-content space-y-1">
                          {aiResponse.suggestions.map((suggestion, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-info mt-0.5">•</span>
                              <span>{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 信頼度 */}
                    {aiResponse?.confidence && (
                      <p className="text-xs text-content-tertiary text-right">
                        AI信頼度: {(aiResponse.confidence * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      {/* 設定モーダル */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={handleSaveSettings}
        onReset={handleResetSettings}
      />

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
      <div className="min-h-screen bg-surface flex items-center justify-center" data-theme="interview-light">
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
    <ToastProvider>
      <AuthContainer />
    </ToastProvider>
  )
}

export default App
