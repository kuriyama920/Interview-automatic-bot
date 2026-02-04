/**
 * 設定モーダルコンポーネント
 */

import { useState, useEffect } from 'react'
import type { AppSettings } from '../hooks/useSettings'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  onSave: (settings: Partial<AppSettings>) => Promise<boolean>
  onReset: () => Promise<boolean>
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  onReset,
}: SettingsModalProps) {
  // ローカル編集用の状態
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'api' | 'ai' | 'appearance'>('api')
  const [showApiKeys, setShowApiKeys] = useState({ deepgram: false, openai: false })

  // settings propが変更されたらローカル状態を更新
  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  // モーダルが開いたときにESCキーで閉じる
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
    <div className="modal modal-open">
      <div className="modal-box max-w-2xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">設定</h3>
          <button className="btn btn-sm btn-circle btn-ghost" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* タブ */}
        <div className="tabs tabs-boxed mb-4">
          <button
            className={`tab ${activeTab === 'api' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API設定
          </button>
          <button
            className={`tab ${activeTab === 'ai' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            AI設定
          </button>
          <button
            className={`tab ${activeTab === 'appearance' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            表示設定
          </button>
        </div>

        {/* タブコンテンツ */}
        <div className="space-y-4">
          {/* API設定タブ */}
          {activeTab === 'api' && (
            <div className="space-y-4">
              <div className="alert alert-info text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="stroke-current shrink-0 w-5 h-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  ></path>
                </svg>
                <span>
                  APIキーを設定すると、環境変数より優先されます。空欄の場合は.envの値を使用します。
                </span>
              </div>

              {/* Deepgram API Key */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Deepgram API Key</span>
                  <a
                    href="https://console.deepgram.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label-text-alt link link-primary"
                  >
                    キーを取得
                  </a>
                </label>
                <div className="join w-full">
                  <input
                    type={showApiKeys.deepgram ? 'text' : 'password'}
                    className="input input-bordered join-item flex-1"
                    placeholder="空欄の場合は環境変数を使用"
                    value={localSettings.deepgramApiKey}
                    onChange={(e) => handleChange('deepgramApiKey', e.target.value)}
                  />
                  <button
                    className="btn join-item"
                    onClick={() =>
                      setShowApiKeys((prev) => ({ ...prev, deepgram: !prev.deepgram }))
                    }
                  >
                    {showApiKeys.deepgram ? '隠す' : '表示'}
                  </button>
                </div>
              </div>

              {/* OpenAI API Key */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">OpenAI API Key</span>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="label-text-alt link link-primary"
                  >
                    キーを取得
                  </a>
                </label>
                <div className="join w-full">
                  <input
                    type={showApiKeys.openai ? 'text' : 'password'}
                    className="input input-bordered join-item flex-1"
                    placeholder="空欄の場合は環境変数を使用"
                    value={localSettings.openaiApiKey}
                    onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                  />
                  <button
                    className="btn join-item"
                    onClick={() =>
                      setShowApiKeys((prev) => ({ ...prev, openai: !prev.openai }))
                    }
                  >
                    {showApiKeys.openai ? '隠す' : '表示'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* AI設定タブ */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              {/* AIモデル選択 */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">AIモデル</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={localSettings.aiModel}
                  onChange={(e) =>
                    handleChange('aiModel', e.target.value as AppSettings['aiModel'])
                  }
                >
                  <option value="gpt-4o">GPT-4o（推奨）</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo（低コスト）</option>
                </select>
              </div>

              {/* Temperature */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">
                    Temperature: {localSettings.aiTemperature.toFixed(1)}
                  </span>
                  <span className="label-text-alt">創造性の度合い</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  className="range range-primary"
                  value={localSettings.aiTemperature}
                  onChange={(e) => handleChange('aiTemperature', parseFloat(e.target.value))}
                />
                <div className="w-full flex justify-between text-xs px-2 mt-1">
                  <span>正確</span>
                  <span>創造的</span>
                </div>
              </div>

              {/* Max Tokens */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">最大トークン数: {localSettings.aiMaxTokens}</span>
                  <span className="label-text-alt">回答の長さ上限</span>
                </label>
                <input
                  type="range"
                  min="500"
                  max="4000"
                  step="100"
                  className="range range-primary"
                  value={localSettings.aiMaxTokens}
                  onChange={(e) => handleChange('aiMaxTokens', parseInt(e.target.value))}
                />
                <div className="w-full flex justify-between text-xs px-2 mt-1">
                  <span>短い</span>
                  <span>長い</span>
                </div>
              </div>

              {/* RAG設定 */}
              <div className="divider">RAG設定（コンテキスト検索）</div>

              {/* Context Min Similarity */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">
                    最小類似度: {(localSettings.contextMinSimilarity * 100).toFixed(0)}%
                  </span>
                  <span className="label-text-alt">高いほど関連性の高い情報のみ使用</span>
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="0.95"
                  step="0.05"
                  className="range range-secondary"
                  value={localSettings.contextMinSimilarity}
                  onChange={(e) =>
                    handleChange('contextMinSimilarity', parseFloat(e.target.value))
                  }
                />
              </div>

              {/* Context Top K */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">参照チャンク数: {localSettings.contextTopK}</span>
                  <span className="label-text-alt">使用するコンテキストの数</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  className="range range-secondary"
                  value={localSettings.contextTopK}
                  onChange={(e) => handleChange('contextTopK', parseInt(e.target.value))}
                />
              </div>
            </div>
          )}

          {/* 表示設定タブ */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              {/* テーマ */}
              <div className="form-control">
                <label className="label">
                  <span className="label-text">テーマ</span>
                </label>
                <select
                  className="select select-bordered w-full"
                  value={localSettings.theme}
                  onChange={(e) =>
                    handleChange('theme', e.target.value as AppSettings['theme'])
                  }
                >
                  <option value="dark">ダーク</option>
                  <option value="light">ライト</option>
                </select>
              </div>

              {/* 自動AI生成 */}
              <div className="form-control">
                <label className="label cursor-pointer">
                  <span className="label-text">質問検出時にAI回答を自動生成</span>
                  <input
                    type="checkbox"
                    className="toggle toggle-primary"
                    checked={localSettings.autoGenerateAI}
                    onChange={(e) => handleChange('autoGenerateAI', e.target.checked)}
                  />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="modal-action">
          <button className="btn btn-ghost" onClick={handleReset} disabled={isSaving}>
            リセット
          </button>
          <div className="flex-1"></div>
          <button className="btn" onClick={onClose} disabled={isSaving}>
            キャンセル
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                保存中...
              </>
            ) : (
              '保存'
            )}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose}></div>
    </div>
  )
}
