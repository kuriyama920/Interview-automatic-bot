/**
 * 設定モーダルコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

import { useState, useEffect } from 'react'
import { Button, IconButton, Input, Select, Toggle, Slider, Alert } from './ui'
import { ProfileTab } from './ProfileTab'

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

const UserIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
)

type TabType = 'profile' | 'ai' | 'audio' | 'appearance'

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'profile', label: 'プロフィール', icon: <UserIcon /> },
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
  const [activeTab, setActiveTab] = useState<TabType>('profile')


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
    if (window.confirm('設定をデフォルトに戻しますか？')) {
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
          {/* プロフィールタブ */}
          {activeTab === 'profile' && <ProfileTab />}

          {/* AI設定タブ */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* AIモデル選択 */}
              <Select
                label="AIモデル"
                value={localSettings.aiModel}
                onChange={(e) => handleChange('aiModel', e.target.value as AppSettings['aiModel'])}
                options={[
                  { value: 'gpt-5-mini', label: 'GPT-5 Mini（推奨・高速）' },
                  { value: 'gpt-5', label: 'GPT-5（高精度）' },
                  { value: 'gpt-4o', label: 'GPT-4o' },
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

        {/* フッター（プロフィールタブは独自の保存ボタンを持つ） */}
        {activeTab !== 'profile' && (
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
        )}
      </div>
    </div>
  )
}
