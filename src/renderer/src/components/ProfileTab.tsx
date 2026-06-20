/**
 * プロフィールタブコンポーネント
 * ProfilePage内で面接プロフィール情報を管理
 */

import { useState, useEffect, useCallback, useRef, KeyboardEvent } from 'react'
import { Button, Input, Alert } from './ui'
import { useInterviewProfile } from '../hooks/useInterviewProfile'

// ============================================================
// TagInput（配列フィールド用）
// ============================================================

interface TagInputProps {
  label: string
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  maxItems?: number
}

function TagInput({ label, tags, onChange, placeholder, maxItems = 20 }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')

  const addTag = () => {
    const value = inputValue.trim()
    if (value && !tags.includes(value) && tags.length < maxItems) {
      onChange([...tags, value])
      setInputValue('')
    }
  }

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-content">{label}</label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/10 text-accent text-xs font-medium rounded-full"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(i)}
                className="hover:text-error transition-colors"
                aria-label={`${tag}を削除`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={addTag}
          disabled={!inputValue.trim() || tags.length >= maxItems}
        >
          追加
        </Button>
      </div>
    </div>
  )
}

// ============================================================
// ProfileTab
// ============================================================

const EMPTY_PROFILE: InterviewProfile = {
  fullName: '',
}

export function ProfileTab() {
  const { profile, isLoading, isSaving, error, saveProfile } = useInterviewProfile()
  const [local, setLocal] = useState<InterviewProfile>(EMPTY_PROFILE)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (profile && !initializedRef.current) {
      setLocal({
        fullName: profile.fullName || '',
        nameReading: profile.nameReading || undefined,
        currentCompany: profile.currentCompany || undefined,
        currentPosition: profile.currentPosition || undefined,
        previousCompanies: profile.previousCompanies || undefined,
        targetCompany: profile.targetCompany || undefined,
        targetPosition: profile.targetPosition || undefined,
        technologies: profile.technologies || undefined,
        certifications: profile.certifications || undefined,
        education: profile.education || undefined,
        yearsOfExperience: profile.yearsOfExperience,
        additionalNotes: profile.additionalNotes || undefined,
      })
      initializedRef.current = true
    }
  }, [profile])

  const handleChange = useCallback(
    <K extends keyof InterviewProfile>(key: K, value: InterviewProfile[K]) => {
      setLocal((prev) => ({ ...prev, [key]: value }))
      setSaveSuccess(false)
    },
    []
  )

  const handleSave = useCallback(async () => {
    if (!local.fullName?.trim()) return
    const success = await saveProfile(local)
    if (success) {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    }
  }, [local, saveProfile])

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <span className="text-sm text-content-secondary">読み込み中...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Alert variant="info">
        プロフィール情報はAI回答生成時に常にコンテキストとして注入されます。正確な固有名詞を入力することで回答精度が向上します。
      </Alert>

      {error && <Alert variant="error">{error}</Alert>}
      {saveSuccess && <Alert variant="success">プロフィールを保存しました</Alert>}

      {/* 基本情報 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">基本情報</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="氏名（必須）"
            value={local.fullName}
            onChange={(e) => handleChange('fullName', e.target.value)}
            placeholder="例: 田中 太郎"
            maxLength={200}
          />
          <Input
            label="ふりがな"
            value={local.nameReading || ''}
            onChange={(e) => handleChange('nameReading', e.target.value || undefined)}
            placeholder="例: たなか たろう"
            maxLength={200}
          />
        </div>
      </section>

      {/* 現職 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">現職</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="企業名"
            value={local.currentCompany || ''}
            onChange={(e) => handleChange('currentCompany', e.target.value || undefined)}
            placeholder="例: 株式会社ABC"
            maxLength={200}
          />
          <Input
            label="ポジション"
            value={local.currentPosition || ''}
            onChange={(e) => handleChange('currentPosition', e.target.value || undefined)}
            placeholder="例: 営業マネージャー"
            maxLength={200}
          />
        </div>
      </section>

      {/* 志望先 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">志望先</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="企業名"
            value={local.targetCompany || ''}
            onChange={(e) => handleChange('targetCompany', e.target.value || undefined)}
            placeholder="例: 株式会社XYZ"
            maxLength={200}
          />
          <Input
            label="ポジション"
            value={local.targetPosition || ''}
            onChange={(e) => handleChange('targetPosition', e.target.value || undefined)}
            placeholder="例: 事業企画"
            maxLength={200}
          />
        </div>
      </section>

      {/* 経歴 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">経歴</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="最終学歴"
            value={local.education || ''}
            onChange={(e) => handleChange('education', e.target.value || undefined)}
            placeholder="例: 〇〇大学 経済学部"
            maxLength={200}
          />
          <Input
            label="経験年数"
            type="number"
            value={local.yearsOfExperience?.toString() || ''}
            onChange={(e) => {
              const val = e.target.value
              if (val === '') {
                handleChange('yearsOfExperience', undefined)
                return
              }
              const num = parseInt(val, 10)
              if (!Number.isNaN(num) && num >= 0 && num <= 60) {
                handleChange('yearsOfExperience', num)
              }
            }}
            placeholder="例: 8"
            min={0}
            max={60}
          />
        </div>
      </section>

      {/* スキル・資格 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">スキル・資格</h3>
        <TagInput
          label="主要技術スキル"
          tags={local.technologies || []}
          onChange={(tags) => handleChange('technologies', tags.length > 0 ? tags : undefined)}
          placeholder="例: Excel（Enterで追加）"
        />
        <TagInput
          label="資格"
          tags={local.certifications || []}
          onChange={(tags) => handleChange('certifications', tags.length > 0 ? tags : undefined)}
          placeholder="例: TOEIC 800（Enterで追加）"
        />
      </section>

      {/* 職歴 */}
      <section className="space-y-4">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">過去の職歴</h3>
        <TagInput
          label="過去の企業"
          tags={local.previousCompanies || []}
          onChange={(tags) => handleChange('previousCompanies', tags.length > 0 ? tags : undefined)}
          placeholder="例: 株式会社DEF（Enterで追加）"
        />
      </section>

      {/* 特記事項 */}
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-content border-b border-border pb-2">特記事項</h3>
        <textarea
          aria-label="特記事項"
          value={local.additionalNotes || ''}
          onChange={(e) => handleChange('additionalNotes', e.target.value || undefined)}
          placeholder="面接で強調したいポイントや補足情報を入力してください"
          maxLength={1000}
          rows={3}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-content
            placeholder:text-content-tertiary focus:outline-none focus:ring-2 focus:ring-accent/50
            focus:border-accent resize-none transition-colors"
        />
        <p className="text-xs text-content-tertiary text-right">
          {(local.additionalNotes || '').length}/1000
        </p>
      </section>

      {/* 保存ボタン */}
      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          onClick={handleSave}
          isLoading={isSaving}
          disabled={!local.fullName?.trim()}
        >
          プロフィールを保存
        </Button>
      </div>
    </div>
  )
}
