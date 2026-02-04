import { useState, useEffect, useRef, useCallback } from 'react'
import { useSTT } from './hooks/useSTT'
import { useAudioCapture } from './hooks/useAudioCapture'
import { useAIResponse } from './hooks/useAIResponse'
import { useSettings } from './hooks/useSettings'
import { useAuth } from './hooks/useAuth'
import { ToastProvider, useToast } from './hooks/useToast'
import DocumentUploadPanel from './components/DocumentUploadPanel'
import { SettingsModal } from './components/SettingsModal'
import { AIResponseSkeleton } from './components/Skeleton'
import { LoginPage } from './components/LoginPage'

function AppContent() {
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(true)
  const [appError, setAppError] = useState<string | null>(null)
  const [isTestMode, setIsTestMode] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastProcessedIndex = useRef<number>(-1)

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
    clearResponse,
  } = useAIResponse()

  // 起動時に環境変数からAPIキーの存在確認
  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const key = await window.electron.config.getApiKey('DEEPGRAM_API_KEY')
        if (key) {
          setApiKey(key) // 存在確認用（実際のキーはMain processで使用）
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

  // 新しい確定文字起こしがあったらAI回答を自動生成
  useEffect(() => {
    if (!settings.autoGenerateAI || isGenerating) return

    const newTranscripts = transcripts.slice(lastProcessedIndex.current + 1)
    if (newTranscripts.length === 0) return

    // 最後の文字起こしで質問を検出
    const latestText = newTranscripts.map((t) => t.text).join(' ')
    if (latestText.trim().length > 10) {
      lastProcessedIndex.current = transcripts.length - 1
      generateStreamResponse(latestText)
    }
  }, [transcripts, settings.autoGenerateAI, isGenerating, generateStreamResponse])

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
      await stopCapture()
      await disconnect()
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

      // 音声データを小さなチャンクに分割して送信
      const chunkSize = 4096
      for (let i = 0; i < audioData.length; i += chunkSize) {
        const chunk = audioData.slice(i, i + chunkSize)
        window.electron.stt.sendAudio(chunk.buffer)
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      // 処理完了を待つ
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

  // 設定保存のラッパー（トースト通知付き）
  const handleSaveSettings = async (newSettings: Parameters<typeof saveSettings>[0]) => {
    const result = await saveSettings(newSettings)
    if (result) {
      toast.success('設定を保存しました')
    }
    return result
  }

  // 設定リセットのラッパー（トースト通知付き）
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
      <div className="min-h-screen bg-base-200 flex items-center justify-center" data-theme="dark">
        <div className="text-center space-y-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/70">アプリケーションを初期化中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-200 p-4" data-theme={settings.theme}>
      <div className="max-w-6xl mx-auto space-y-4">
        {/* ヘッダー */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body py-4">
            <div className="flex items-center justify-between">
              <h1 className="card-title text-xl">Interview Bot</h1>
              <div className="flex items-center gap-2">
                <div className="badge badge-success badge-sm">Phase 5: SaaS</div>
                {/* 設定ボタン */}
                <button
                  className="btn btn-ghost btn-circle btn-sm"
                  onClick={() => setShowSettings(true)}
                  title="設定"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                {/* ユーザーメニュー */}
                <div className="dropdown dropdown-end">
                  <label tabIndex={0} className="btn btn-ghost btn-circle avatar btn-sm">
                    <div className="w-8 rounded-full">
                      {user?.picture ? (
                        <img src={user.picture} alt={user.name || 'User'} />
                      ) : (
                        <div className="bg-primary text-primary-content w-full h-full flex items-center justify-center text-sm">
                          {user?.name?.[0] || user?.email?.[0] || '?'}
                        </div>
                      )}
                    </div>
                  </label>
                  <ul
                    tabIndex={0}
                    className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-100 rounded-box w-52"
                  >
                    <li className="menu-title">
                      <span className="text-xs">{user?.email}</span>
                    </li>
                    <li>
                      <span className="text-xs text-base-content/60">
                        プラン: {user?.subscriptionTier === 'free' ? 'Free' : user?.subscriptionTier === 'pro' ? 'Pro' : 'Enterprise'}
                      </span>
                    </li>
                    <li className="divider my-1"></li>
                    <li>
                      <button onClick={logout} className="text-error">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                          />
                        </svg>
                        ログアウト
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* コントロール */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex gap-2 flex-wrap">
                <div className={`badge ${isConnected ? 'badge-success' : 'badge-ghost'}`}>
                  {isConnected ? '接続中' : '未接続'}
                </div>
                <div className={`badge ${isCapturing ? 'badge-success' : 'badge-ghost'}`}>
                  {isCapturing ? '録音中' : '停止'}
                </div>
                {isTestMode && <div className="badge badge-warning">テスト中</div>}
                {isGenerating && <div className="badge badge-info">AI生成中</div>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {!isConnected && !isTestMode ? (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={handleStart}
                      disabled={!apiKey || isLoading}
                    >
                      {isLoading ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          接続中...
                        </>
                      ) : (
                        '録音開始'
                      )}
                    </button>
                    <label className="btn btn-outline btn-secondary">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.wav,.mp3,.webm,.ogg"
                        className="hidden"
                        onChange={handleTestFile}
                        disabled={!apiKey || isLoading}
                      />
                      音声ファイルでテスト
                    </label>
                  </>
                ) : isConnected ? (
                  <button className="btn btn-error" onClick={handleStop} disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        停止中...
                      </>
                    ) : (
                      '録音停止'
                    )}
                  </button>
                ) : null}
                {transcripts.length > 0 && (
                  <>
                    <button
                      className="btn btn-secondary"
                      onClick={handleManualGenerate}
                      disabled={isLoading || isGenerating}
                    >
                      {isGenerating ? (
                        <>
                          <span className="loading loading-spinner loading-sm"></span>
                          生成中...
                        </>
                      ) : (
                        'AI回答生成'
                      )}
                    </button>
                    <button className="btn btn-ghost" onClick={handleClear} disabled={isLoading}>
                      クリア
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* 自動生成トグル */}
            <div className="form-control mt-2">
              <label className="label cursor-pointer justify-start gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-sm"
                  checked={settings.autoGenerateAI}
                  onChange={(e) => saveSettings({ autoGenerateAI: e.target.checked })}
                />
                <span className="label-text">文字起こし後に自動でAI回答を生成</span>
              </label>
            </div>
          </div>
        </div>

        {/* WSL2警告 */}
        <div className="alert alert-warning">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <p className="font-bold">WSL2環境ではマイクが使用できません</p>
            <p className="text-sm">
              「音声ファイルでテスト」ボタンで動作確認できます。本番利用はWindows側で実行してください。
            </p>
          </div>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
            <button className="btn btn-sm btn-ghost" onClick={() => setAppError(null)}>
              ✕
            </button>
          </div>
        )}

        {/* メインコンテンツ: 3カラムレイアウト */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* コンテキスト設定 (サイドバー) */}
          <div className="lg:col-span-1">
            <DocumentUploadPanel />
          </div>

          {/* 文字起こし結果 */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-lg">文字起こし（面接官の質問）</h2>
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-2">
                {transcripts.length === 0 && !currentText ? (
                  <p className="text-base-content/50 text-center py-8">
                    録音を開始すると、ここに文字起こしが表示されます
                  </p>
                ) : (
                  <>
                    {transcripts.map((t, i) => (
                      <div key={i} className="p-2 bg-base-200 rounded-lg">
                        <p>{t.text}</p>
                        <p className="text-xs text-base-content/50 mt-1">
                          確信度: {(t.confidence * 100).toFixed(1)}%
                        </p>
                      </div>
                    ))}
                    {currentText && (
                      <div className="p-2 bg-primary/20 rounded-lg animate-pulse">
                        <p className="text-primary">{currentText}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* AI回答 */}
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-lg">
                AI推奨回答
                {isGenerating && (
                  <span className="loading loading-dots loading-sm text-primary"></span>
                )}
              </h2>
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto space-y-4">
                {/* AI生成中でストリーミングがまだの場合はスケルトン表示 */}
                {isGenerating && !streamingText ? (
                  <AIResponseSkeleton />
                ) : !aiResponse && !streamingText ? (
                  <p className="text-base-content/50 text-center py-8">
                    面接官の質問に対するAI推奨回答がここに表示されます
                  </p>
                ) : (
                  <>
                    {/* メイン回答 */}
                    <div className="p-4 bg-success/20 rounded-lg border border-success/30">
                      <h3 className="font-semibold text-success mb-2">回答例</h3>
                      <p className="whitespace-pre-wrap">
                        {aiResponse?.answer || streamingText}
                      </p>
                    </div>

                    {/* 補足ポイント */}
                    {aiResponse?.suggestions && aiResponse.suggestions.length > 0 && (
                      <div className="p-4 bg-info/20 rounded-lg border border-info/30">
                        <h3 className="font-semibold text-info mb-2">補足ポイント</h3>
                        <ul className="list-disc list-inside space-y-1">
                          {aiResponse.suggestions.map((suggestion, i) => (
                            <li key={i}>{suggestion}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 信頼度 */}
                    {aiResponse?.confidence && (
                      <div className="text-xs text-base-content/50 text-right">
                        AI信頼度: {(aiResponse.confidence * 100).toFixed(0)}%
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 設定モーダル */}
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSave={handleSaveSettings}
          onReset={handleResetSettings}
        />
      </div>
    </div>
  )
}

// 認証状態を管理するコンテナ
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
      <div className="min-h-screen bg-base-200 flex items-center justify-center" data-theme="dark">
        <div className="text-center space-y-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-base-content/70">認証状態を確認中...</p>
        </div>
      </div>
    )
  }

  // 未認証
  if (!isAuthenticated) {
    return (
      <LoginPage onLogin={loginWithGoogle} isLoading={isAuthLoading} error={authError} />
    )
  }

  // 認証済み
  return <AppContent />
}

// ToastProviderでラップしたApp
function App() {
  return (
    <ToastProvider>
      <AuthContainer />
    </ToastProvider>
  )
}

export default App
