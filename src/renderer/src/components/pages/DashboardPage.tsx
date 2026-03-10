/**
 * ダッシュボードページ
 * 使用量概要 + クイックスタート + 準備状況
 */

import { useEffect } from 'react'
import { useSubscription } from '../../hooks/useSubscription'
import { PageHeader } from '../ui/PageHeader'
import { Spinner } from '../ui'
import { MicrophoneIcon, SparklesIcon } from '../ui/icons'
import { QuickStartCard } from '../dashboard/QuickStartCard'
import { PreparationStatus } from '../dashboard/PreparationStatus'
import { UsageCard } from '../dashboard/UsageCard'

const StorageIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
  </svg>
)

export function DashboardPage() {
  const { data, isLoading, refresh } = useSubscription()

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader title="ダッシュボード" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl space-y-6">
          {/* クイックスタート */}
          <QuickStartCard />

          {/* 2カラムグリッド: 準備状況 + 使用量 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 準備状況 */}
            <PreparationStatus />

            {/* 使用量 */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-content px-1">今月の使用量</h3>
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner size="md" className="text-accent" />
                </div>
              ) : data ? (
                <div className="space-y-3">
                  <UsageCard
                    icon={<MicrophoneIcon className="w-4 h-4" />}
                    label="音声認識 (STT)"
                    used={data.usage.sttMinutes}
                    limit={data.plan?.limits.sttMinutesMonthly || 30}
                    unit="分"
                  />
                  <UsageCard
                    icon={<SparklesIcon />}
                    label="AIトークン"
                    used={data.usage.aiTokens}
                    limit={data.plan?.limits.aiTokensMonthly || 30000}
                    unit=""
                  />
                  <UsageCard
                    icon={<StorageIcon />}
                    label="ストレージ"
                    used={Math.round(data.usage.storageBytes / 1024 / 1024)}
                    limit={
                      data.plan?.limits.storageBytesTotal === -1
                        ? -1
                        : Math.round((data.plan?.limits.storageBytesTotal || 52428800) / 1024 / 1024)
                    }
                    unit="MB"
                  />
                </div>
              ) : (
                <div className="bg-surface rounded-xl border border-border p-4 text-center">
                  <p className="text-sm text-content-tertiary">使用量データを取得中...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
