/**
 * スケルトンローダーコンポーネント
 * Linear Design + Apple Vibrancy スタイル
 */

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-tertiary rounded-lg ${className}`}
    />
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-surface rounded-xl border border-border shadow-card p-5">
      <Skeleton className="h-5 w-1/3 mb-4" />
      <SkeletonText lines={4} />
    </div>
  )
}

export function TranscriptSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-3.5 bg-surface-secondary rounded-xl border border-border space-y-2.5"
        >
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

export function AIResponseSkeleton() {
  return (
    <div className="space-y-4">
      {/* メイン回答スケルトン */}
      <div className="p-4 bg-success-subtle rounded-xl border border-success/20 space-y-3">
        <Skeleton className="h-5 w-20 bg-success/20" />
        <SkeletonText lines={5} />
      </div>

      {/* 補足ポイントスケルトン */}
      <div className="p-4 bg-info-subtle rounded-xl border border-info/20 space-y-3">
        <Skeleton className="h-5 w-28 bg-info/20" />
        <div className="space-y-2 pl-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  )
}

export function DocumentSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg"
        >
          <Skeleton className="w-8 h-8 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}
