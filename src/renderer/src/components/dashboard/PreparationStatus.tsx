/**
 * 面接準備状況カード
 * プロフィール/資料/質問の準備度を表示
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useNavigation, type PageId } from '../../contexts/NavigationContext'
import { CheckIcon } from '../ui/icons'

const CircleIcon = () => (
  <svg className="w-4 h-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
  </svg>
)

interface StatusItem {
  label: string
  description: string
  completed: boolean
  page: PageId
}

export function PreparationStatus() {
  const { user } = useAuth()
  const { navigateTo } = useNavigation()
  const [docCounts, setDocCounts] = useState({ resume: 0, jobPosting: 0 })
  const [questionCount, setQuestionCount] = useState(0)

  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true

    // ドキュメント数を取得
    window.electron.document.list().then((result) => {
      if (!mountedRef.current) return
      if (result.success && result.documents) {
        const resume = result.documents.filter((d) => d.type === 'resume').length
        const jobPosting = result.documents.filter((d) => d.type === 'job_posting').length
        setDocCounts({ resume, jobPosting })
      }
    }).catch(() => { /* データ取得失敗は無視 */ })

    // 質問数を取得
    window.electron.questions.list().then((result) => {
      if (!mountedRef.current) return
      if (result.success && result.questions) {
        setQuestionCount(result.questions.length)
      }
    }).catch(() => { /* データ取得失敗は無視 */ })

    return () => { mountedRef.current = false }
  }, [])

  const profileComplete = !!user?.interviewProfile?.fullName

  const items: StatusItem[] = [
    {
      label: 'プロフィール',
      description: profileComplete ? '設定済み' : '未設定 - AIの回答精度が向上します',
      completed: profileComplete,
      page: 'profile',
    },
    {
      label: '履歴書',
      description: docCounts.resume > 0 ? `${docCounts.resume}件アップロード済` : '未アップロード',
      completed: docCounts.resume > 0,
      page: 'documents',
    },
    {
      label: '求人票',
      description: docCounts.jobPosting > 0 ? `${docCounts.jobPosting}件アップロード済` : '未アップロード',
      completed: docCounts.jobPosting > 0,
      page: 'documents',
    },
    {
      label: '想定質問',
      description: questionCount > 0 ? `${questionCount}件準備済` : '未準備',
      completed: questionCount > 0,
      page: 'questions',
    },
  ]

  const completedCount = items.filter((i) => i.completed).length
  const percentage = Math.round((completedCount / items.length) * 100)

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-content">面接準備状況</h3>
        <span className="text-xs font-medium text-accent">{percentage}% 完了</span>
      </div>

      {/* プログレスバー */}
      <div className="h-1.5 bg-surface-tertiary rounded-full overflow-hidden mb-4">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 項目リスト */}
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => navigateTo(item.page)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left group"
          >
            {item.completed ? <CheckIcon className="w-4 h-4 text-success" /> : <CircleIcon />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.completed ? 'text-content' : 'text-content-secondary'}`}>
                {item.label}
              </p>
              <p className="text-[10px] text-content-tertiary truncate">{item.description}</p>
            </div>
            <svg className="w-4 h-4 text-content-tertiary opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
