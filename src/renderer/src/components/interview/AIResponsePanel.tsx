/**
 * AI回答パネル
 * ストリーミングAI回答 + 想定質問マッチ表示 + 自動スクロール
 * Phase 2: Speculative（薄い色・下書き）/ Committed（通常色・確定）フェーズ別スタイリング
 * 二重バッファ対応: Committed生成中もSpeculative表示を維持
 */

import { useRef, useEffect, useCallback, useState } from 'react'
import { useInterview } from '../../contexts/InterviewContext'
import { Spinner } from '../ui'
import { SparklesDetailedIcon } from '../ui/icons'

function AIResponseSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="p-4 bg-surface-secondary rounded-lg">
        <div className="h-4 bg-surface-tertiary rounded w-1/4 mb-3" />
        <div className="space-y-2">
          <div className="h-3 bg-surface-tertiary rounded w-full" />
          <div className="h-3 bg-surface-tertiary rounded w-5/6" />
          <div className="h-3 bg-surface-tertiary rounded w-4/6" />
        </div>
      </div>
    </div>
  )
}

function PhaseIndicator({ phase, isGenerating }: { phase: string | null; isGenerating: boolean }) {
  if (!isGenerating) return null

  if (phase === 'speculative') {
    return (
      <span className="text-[10px] text-accent/60 flex items-center gap-1.5 animate-pulse">
        <Spinner size="sm" className="text-accent/60" />
        下書き中...
      </span>
    )
  }

  if (phase === 'committed') {
    // Committed生成中もSpeculative表示を維持しているため、異なるメッセージ
    return (
      <span className="text-[10px] text-accent/70 flex items-center gap-1.5 animate-pulse">
        <Spinner size="sm" className="text-accent/70" />
        確定版を生成中...
      </span>
    )
  }

  return (
    <span className="text-[10px] text-accent flex items-center gap-1.5 animate-pulse">
      <Spinner size="sm" className="text-accent" />
      生成中...
    </span>
  )
}

interface HeaderStatusProps {
  cachedMatch: { answer: string; similarity: number } | null
  isGenerating: boolean
  aiResponse: AIResponse | null
  currentPhase: AIPhase | null
}

function HeaderStatus({ cachedMatch, isGenerating, aiResponse, currentPhase }: HeaderStatusProps) {
  if (cachedMatch) {
    return <span className="text-[10px] text-success font-medium">即時マッチ</span>
  }
  if (isGenerating) {
    return <PhaseIndicator phase={currentPhase} isGenerating={isGenerating} />
  }
  if (aiResponse) {
    return <span className="text-[10px] text-success font-medium">完了</span>
  }
  return null
}

export function AIResponsePanel() {
  const { aiResponse, streamingText, isGenerating, currentPhase, cachedMatch, adoptionState } = useInterview()

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)

  // フェードトランジション制御: 不採用時にフェードアウト→フェードイン
  const [isFading, setIsFading] = useState(false)
  const prevAdoptionStateRef = useRef(adoptionState)

  useEffect(() => {
    const wasReplaced = prevAdoptionStateRef.current !== adoptionState && adoptionState === 'replaced'
    prevAdoptionStateRef.current = adoptionState
    if (wasReplaced) {
      setIsFading(true)
      const timer = setTimeout(() => setIsFading(false), 300)
      return () => clearTimeout(timer)
    }
  }, [adoptionState])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    isUserScrolledUp.current = !atBottom
  }, [])

  useEffect(() => {
    if (!isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [streamingText, aiResponse, cachedMatch])

  const displayText = isGenerating
    ? (streamingText || aiResponse?.answer)
    : (aiResponse?.answer || streamingText)

  const isSpeculative = currentPhase === 'speculative'

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-accent/[0.02]">
      {/* ヘッダー */}
      <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SparklesDetailedIcon />
          <span className="text-xs font-medium text-content-secondary">AI 回答提案</span>
        </div>
        <div className="flex items-center gap-2">
          <HeaderStatus
            cachedMatch={cachedMatch}
            isGenerating={isGenerating}
            aiResponse={aiResponse}
            currentPhase={currentPhase}
          />
        </div>
      </div>

      {/* AI回答本文 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-5 py-4"
      >
        {cachedMatch ? (
          <div className="space-y-3">
            <div className="chat chat-start">
              <div className="chat-header text-[10px] mb-0.5">
                <span className="text-success font-medium">想定質問マッチ</span>
                <span className="text-content-tertiary ml-2">
                  類似度 {Math.round(cachedMatch.similarity * 100)}%
                </span>
              </div>
              <div className="chat-bubble bg-success/10 text-content text-[13px] leading-relaxed min-h-0 font-medium whitespace-pre-wrap">
                {cachedMatch.answer}
              </div>
            </div>
            <div ref={bottomRef} />
          </div>
        ) : isGenerating && !streamingText && currentPhase !== 'committed' ? (
          // Committed生成中はSpeculativeの結果が残っているのでスケルトン不要
          <AIResponseSkeleton />
        ) : !displayText ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <SparklesDetailedIcon />
              <p className="text-content-tertiary text-sm">
                面接官の質問に対するAI推奨回答がここに表示されます
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="chat chat-start">
              <div className="chat-header text-[10px] mb-0.5">
                {isSpeculative ? (
                  <span className="text-accent/50 italic">下書き（確定前）</span>
                ) : currentPhase === 'committed' && isGenerating ? (
                  // Committed生成中にSpeculative表示を維持している状態
                  <span className="text-accent/50 italic">下書き表示中（確定版を生成中）</span>
                ) : (
                  <span className="text-content-secondary">AI アシスタント</span>
                )}
              </div>
              <div
                className={[
                  'chat-bubble text-[13px] leading-relaxed min-h-0 font-medium whitespace-pre-wrap',
                  'transition-[background-color,color,opacity] duration-300',
                  isSpeculative
                    ? 'bg-accent/5 text-content/50 italic'
                    : 'bg-accent/10 text-content',
                  isFading ? 'opacity-0' : 'opacity-100',
                ].join(' ')}
              >
                {displayText}
                {isGenerating && streamingText && (
                  <span
                    className={[
                      'inline-block w-0.5 h-3.5 ml-0.5 animate-pulse',
                      isSpeculative ? 'bg-accent/40' : 'bg-accent',
                    ].join(' ')}
                  />
                )}
              </div>
            </div>
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}
