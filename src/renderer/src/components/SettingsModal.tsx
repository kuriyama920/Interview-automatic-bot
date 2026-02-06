/**
 * 設定モーダルコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { useState, useEffect } from 'react'
import type { AppSettings } from '../hooks/useSettings'
import { Button, IconButton, Input, Select, Toggle, Slider, Alert } from './ui'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onSave: (settings: Partial<AppSettings>) => Promise<boolean>
  onReset: () => Promise<boolean>
}

// アイコン
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const KeyIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
    />
  </svg>
)

const BrainIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
)

const PaletteIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
    />
  </svg>
)

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
)

const EyeOffIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
)

const MicrophoneIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
    />
  </svg>
)

type TabType = 'api' | 'ai' | 'audio' | 'appearance'

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'api', label: 'API設定', icon: <KeyIcon /> },
  { id: 'ai', label: 'AI設定', icon: <BrainIcon /> },
  { id: 'audio', label: '音声設定', icon: <MicrophoneIcon /> },
  { id: 'appearance', label: '表示設定', icon: <PaletteIcon /> },
]

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  onReset,
}: SettingsModalProps) {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('api')
  const [showApiKeys, setShowApiKeys] = useState({ deepgram: false, openai: false })

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    const success = await onSave(localSettings)
    setIsSaving(false)
    if (success) {
      onClose()
    }
  }

  const handleReset = async () => {
    if (window.confirm('設定をデフォルトに戻しますか？APIキーもクリアされます。')) {
      setIsSaving(true)
      await onReset()
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* バックドロップ */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* モーダル */}
      <div className="relative w-full max-w-2xl bg-surface rounded-2xl shadow-modal border border-border animate-fade-in">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-content">設定</h2>
          <IconButton icon={<CloseIcon />} label="閉じる" onClick={onClose} />
        </div>

        {/* タブ */}
        <div className="flex border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
                ${
                  activeTab === tab.id
                    ? 'border-accent text-accent'
                    : 'border-transparent text-content-secondary hover:text-content hover:bg-surface-hover'
                }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* コンテンツ */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* API設定タブ */}
          {activeTab === 'api' && (
            <div className="space-y-6">
              <Alert variant="info">
                APIキーを設定すると、環境変数より優先されます。空欄の場合は.envの値を使用します。
              </Alert>

              {/* Deepgram API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-content">Deepgram API Key</label>
                  <a
                    href="https://console.deepgram.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    キーを取得 →
                  </a>
                </div>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.deepgram ? 'text' : 'password'}
                    placeholder="空欄の場合は環境変数を使用"
                    value={localSettings.deepgramApiKey}
                    onChange={(e) => handleChange('deepgramApiKey', e.target.value)}
                    className="flex-1"
                  />
                  <IconButton
                    icon={showApiKeys.deepgram ? <EyeOffIcon /> : <EyeIcon />}
                    label={showApiKeys.deepgram ? '隠す' : '表示'}
                    variant="secondary"
                    onClick={() => setShowApiKeys((prev) => ({ ...prev, deepgram: !prev.deepgram }))}
                  />
                </div>
              </div>

              {/* OpenAI API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-content">OpenAI API Key</label>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent hover:underline"
                  >
                    キーを取得 →
                  </a>
                </div>
                <div className="flex gap-2">
                  <Input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    placeholder="空欄の場合は環境変数を使用"
                    value={localSettings.openaiApiKey}
                    onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                    className="flex-1"
                  />
                  <IconButton
                    icon={showApiKeys.openai ? <EyeOffIcon /> : <EyeIcon />}
                    label={showApiKeys.openai ? '隠す' : '表示'}
                    variant="secondary"
                    onClick={() => setShowApiKeys((prev) => ({ ...prev, openai: !prev.openai }))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* AI設定タブ */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* AIモデル選択 */}
              <Select
                label="AIモデル"
                value={localSettings.aiModel}
                onChange={(e) => handleChange('aiModel', e.target.value as AppSettings['aiModel'])}
                options={[
                  { value: 'gpt-5', label: 'GPT-5（推奨）' },
                  { value: 'gpt-4o', label: 'GPT-4o' },
                  { value: 'gpt-4o-mini', label: 'GPT-4o mini（低コスト）' },
                ]}
              />

              {/* Temperature */}
              <Slider
                label="Temperature"
                valueLabel={`${localSettings.aiTemperature.toFixed(1)} - ${localSettings.aiTemperature < 0.3 ? '正確' : localSettings.aiTemperature > 0.7 ? '創造的' : 'バランス'}`}
                min={0}
                max={1}
                step={0.1}
                value={localSettings.aiTemperature}
                onChange={(value) => handleChange('aiTemperature', value)}
              />

              {/* Max Tokens */}
              <Slider
                label="最大トークン数"
                valueLabel={`${localSettings.aiMaxTokens} トークン`}
                min={500}
                max={4000}
                step={100}
                value={localSettings.aiMaxTokens}
                onChange={(value) => handleChange('aiMaxTokens', value)}
              />

              <hr className="border-border" />

              <h3 className="text-sm font-medium text-content">RAG設定（コンテキスト検索）</h3>

              {/* Context Min Similarity */}
              <Slider
                label="最小類似度"
                valueLabel={`${(localSettings.contextMinSimilarity * 100).toFixed(0)}%`}
                min={0.5}
                max={0.95}
                step={0.05}
                value={localSettings.contextMinSimilarity}
                onChange={(value) => handleChange('contextMinSimilarity', value)}
              />

              {/* Context Top K */}
              <Slider
                label="参照チャンク数"
                valueLabel={`${localSettings.contextTopK} 件`}
                min={1}
                max={10}
                step={1}
                value={localSettings.contextTopK}
                onChange={(value) => handleChange('contextTopK', value)}
              />
            </div>
          )}

          {/* 音声設定タブ (Phase 6.5) */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
              <Alert variant="info">
                面接モードではZoom/Teams等の相手の声も文字起こしされます。
              </Alert>

              {/* 音声キャプチャ対象 */}
              <Select
                label="音声キャプチャ対象"
                value={localSettings.audioSource || 'mic'}
                onChange={(e) => handleChange('audioSource', e.target.value as AppSettings['audioSource'])}
                options={[
                  { value: 'mic', label: 'マイクのみ（通常）' },
                  { value: 'system', label: 'システム音声のみ' },
                  { value: 'both', label: 'マイク + システム音声（面接モード・推奨）' },
                ]}
              />

              <div className="p-4 bg-surface-secondary rounded-lg">
                <h4 className="text-sm font-medium text-content mb-2">音声ソースの説明</h4>
                <ul className="text-xs text-content-secondary space-y-1.5">
                  <li><strong>マイクのみ:</strong> 自分の声だけをキャプチャ（対面面接向け）</li>
                  <li><strong>システム音声のみ:</strong> PCから出る音声のみ（録音確認向け）</li>
                  <li><strong>マイク + システム音声:</strong> 両方をキャプチャ（オンライン面接向け）</li>
                </ul>
              </div>

              <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg">
                <p className="text-xs text-warning-content">
                  <strong>注意:</strong> システム音声キャプチャはPC上のすべての音声を拾います。
                  通知音やBGMも文字起こしに含まれる可能性があります。
                </p>
              </div>
            </div>
          )}

          {/* 表示設定タブ */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              {/* テーマ */}
              <Select
                label="テーマ"
                value={localSettings.theme}
                onChange={(e) => handleChange('theme', e.target.value as AppSettings['theme'])}
                options={[
                  { value: 'interview-light', label: 'ライト（推奨）' },
                  { value: 'dark', label: 'ダーク' },
                ]}
              />

              {/* 自動AI生成 */}
              <div className="flex items-center justify-between p-4 bg-surface-secondary rounded-lg">
                <div>
                  <p className="text-sm font-medium text-content">自動AI回答生成</p>
                  <p className="text-xs text-content-secondary mt-0.5">
                    質問検出時に自動でAI回答を生成します
                  </p>
                </div>
                <Toggle
                  checked={localSettings.autoGenerateAI}
                  onChange={(checked) => handleChange('autoGenerateAI', checked)}
                />
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-surface-secondary rounded-b-2xl">
          <Button variant="ghost" onClick={handleReset} disabled={isSaving}>
            リセット
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              キャンセル
            </Button>
            <Button variant="primary" onClick={handleSave} isLoading={isSaving}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
