/**
 * スケルトンローダーコンポーネント
 */

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-base-300 rounded ${className}`} />
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
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
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body">
        <Skeleton className="h-6 w-1/3 mb-4" />
        <SkeletonText lines={4} />
      </div>
    </div>
  )
}

export function TranscriptSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 bg-base-200 rounded-lg space-y-2">
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
      <div className="p-4 bg-success/10 rounded-lg border border-success/20 space-y-3">
        <Skeleton className="h-5 w-20" />
        <SkeletonText lines={5} />
      </div>

      {/* 補足ポイントスケルトン */}
      <div className="p-4 bg-info/10 rounded-lg border border-info/20 space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="space-y-2 pl-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    </div>
  )
}
