/**
 * サブスクリプション管理モーダル (Phase 7)
 * プラン選択、使用量表示、Customer Portal へのリンク
 * SettingsModal.tsx と同パターン
 */

import { useEffect } from 'react'
import { useSubscription } from '../hooks/useSubscription'
import { Button, Badge, Spinner, Alert } from './ui'

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
}

// 使用量バー
function UsageBar({
  label,
  used,
  limit,
  unit,
}: {
  label: string
  used: number
  limit: number
  unit: string
}) {
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min((used / limit) * 100, 100)
  const isWarning = percentage >= 80
  const isDanger = percentage >= 95

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-content-secondary">{label}</span>
        <span className="text-content font-medium">
          {used.toLocaleString()} / {isUnlimited ? '無制限' : `${limit.toLocaleString()} ${unit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-surface-tertiary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              isDanger
                ? 'bg-error'
                : isWarning
                  ? 'bg-warning'
                  : 'bg-accent'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}

// プランカード
function PlanCard({
  plan,
  isCurrentPlan,
  onSelect,
}: {
  plan: {
    id: string
    name: string
    priceMonthly: number
    stripePriceIdMonthly: string | null
    limits: {
      sttMinutesMonthly: number
      aiTokensMonthly: number
      storageBytesTotal: number
      maxDocuments: number
    }
    features: Record<string, boolean>
  }
  isCurrentPlan: boolean
  onSelect: (priceId: string) => void
}) {
  const isPopular = plan.id === 'pro'
  const isFree = plan.id === 'free'
  const isUnlimited = (val: number) => val === -1

  return (
    <div
      className={`relative p-5 rounded-xl border transition-all ${
        isCurrentPlan
          ? 'border-accent bg-accent-subtle'
          : isPopular
            ? 'border-accent/50 bg-surface'
            : 'border-border bg-surface'
      }`}
    >
      {isPopular && !isCurrentPlan && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge variant="info" size="sm">おすすめ</Badge>
        </div>
      )}

      <div className="text-center mb-4">
        <h3 className="text-lg font-semibold text-content">{plan.name}</h3>
        <div className="mt-2">
          {isFree ? (
            <span className="text-2xl font-bold text-content">無料</span>
          ) : (
            <>
              <span className="text-2xl font-bold text-content">
                ¥{plan.priceMonthly.toLocaleString()}
              </span>
              <span className="text-content-secondary text-sm"> / 月</span>
            </>
          )}
        </div>
      </div>

      <ul className="space-y-2 text-sm text-content-secondary mb-5">
        <li className="flex items-center gap-2">
          <CheckIcon />
          STT: {isUnlimited(plan.limits.sttMinutesMonthly)
            ? '無制限'
            : `${plan.limits.sttMinutesMonthly}分/月`}
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon />
          AIトークン: {isUnlimited(plan.limits.aiTokensMonthly)
            ? '無制限'
            : `${plan.limits.aiTokensMonthly.toLocaleString()}/月`}
        </li>
        <li className="flex items-center gap-2">
          <CheckIcon />
          ドキュメント: {isUnlimited(plan.limits.maxDocuments)
            ? '無制限'
            : `${plan.limits.maxDocuments}件`}
        </li>
        {plan.features.custom_api_keys && (
          <li className="flex items-center gap-2">
            <CheckIcon />
            カスタムAPIキー
          </li>
        )}
        {plan.features.priority_support && (
          <li className="flex items-center gap-2">
            <CheckIcon />
            優先サポート
          </li>
        )}
      </ul>

      {isCurrentPlan ? (
        <Button variant="secondary" className="w-full" disabled>
          現在のプラン
        </Button>
      ) : isFree ? (
        <Button variant="secondary" className="w-full" disabled>
          -
        </Button>
      ) : plan.stripePriceIdMonthly ? (
        <Button
          variant={isPopular ? 'primary' : 'secondary'}
          className="w-full"
          onClick={() => onSelect(plan.stripePriceIdMonthly!)}
        >
          アップグレード
        </Button>
      ) : (
        <Button variant="secondary" className="w-full" disabled>
          準備中
        </Button>
      )}
    </div>
  )
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-success flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}

export function SubscriptionModal({ isOpen, onClose }: SubscriptionModalProps) {
  const { data, isLoading, error, checkout, openPortal, refresh } = useSubscription()

  // モーダルが開かれるたびにリフレッシュ
  useEffect(() => {
    if (isOpen) {
      refresh()
    }
  }, [isOpen, refresh])

  if (!isOpen) return null

  const currentTier = data?.subscription.tier || 'free'
  const isPaid = currentTier !== 'free'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* オーバーレイ */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* モーダル */}
      <div className="relative bg-surface rounded-2xl border border-border shadow-modal max-w-3xl w-[95%] max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* ヘッダー */}
        <div className="sticky top-0 bg-surface/90 backdrop-blur-glass border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-content">プラン管理</h2>
            <p className="text-sm text-content-secondary mt-0.5">
              現在のプラン: <span className="font-medium text-content">{data?.plan?.name || 'Free'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <svg className="w-5 h-5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* エラー表示 */}
          {error && (
            <Alert variant="error">{error}</Alert>
          )}

          {/* ローディング */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" className="text-accent" />
            </div>
          ) : data ? (
            <>
              {/* 使用量セクション */}
              <div className="p-5 bg-surface-secondary rounded-xl space-y-4">
                <h3 className="text-sm font-semibold text-content">今月の使用量</h3>
                <UsageBar
                  label="音声認識 (STT)"
                  used={data.usage.sttMinutes}
                  limit={data.plan?.limits.sttMinutesMonthly || 60}
                  unit="分"
                />
                <UsageBar
                  label="AIトークン"
                  used={data.usage.aiTokens}
                  limit={data.plan?.limits.aiTokensMonthly || 50000}
                  unit=""
                />
                <UsageBar
                  label="ドキュメント容量"
                  used={Math.round(data.usage.storageBytes / 1024 / 1024)}
                  limit={
                    data.plan?.limits.storageBytesTotal === -1
                      ? -1
                      : Math.round((data.plan?.limits.storageBytesTotal || 52428800) / 1024 / 1024)
                  }
                  unit="MB"
                />
              </div>

              {/* プランカード */}
              <div>
                <h3 className="text-sm font-semibold text-content mb-4">プラン一覧</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {data.plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      isCurrentPlan={plan.id === currentTier}
                      onSelect={checkout}
                    />
                  ))}
                </div>
              </div>

              {/* Customer Portal */}
              {isPaid && (
                <div className="p-4 bg-surface-secondary rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-content">サブスクリプション管理</p>
                    <p className="text-xs text-content-secondary mt-0.5">
                      支払い方法の変更、プランの変更・解約はこちら
                    </p>
                  </div>
                  <Button variant="secondary" onClick={openPortal}>
                    管理画面を開く
                  </Button>
                </div>
              )}

              {/* サブスクリプション情報 */}
              {data.subscription.periodEnd && (
                <p className="text-xs text-content-tertiary text-center">
                  次回更新日: {new Date(data.subscription.periodEnd).toLocaleDateString('ja-JP')}
                  {data.subscription.status === 'canceled' && ' (キャンセル済み - 期間終了後にFreeプランに移行)'}
                  {data.subscription.status === 'past_due' && ' (支払い遅延中)'}
                </p>
              )}
            </>
          ) : (
            <p className="text-content-secondary text-center py-12">
              サブスクリプション情報を取得できませんでした
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
