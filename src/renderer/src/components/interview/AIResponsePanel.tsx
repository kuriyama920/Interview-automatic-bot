/**
 * AI回答パネル
 * ストリーミングAI回答 + 想定質問マッチ表示 + 自動スクロール
 */

import { useRef, useEffect, useCallback } from 'react'
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

export function AIResponsePanel() {
  const { aiResponse, streamingText, isGenerating, cachedMatch } = useInterview()

  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isUserScrolledUp = useRef(false)

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

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-accent/[0.02]">
      {/* ヘッダー */}
      <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SparklesDetailedIcon />
          <span className="text-xs font-medium text-content-secondary">AI 回答提案</span>
        </div>
        <div className="flex items-center gap-2">
          {cachedMatch ? (
            <span className="text-[10px] text-success font-medium">即時マッチ</span>
          ) : isGenerating ? (
            <span className="text-[10px] text-accent flex items-center gap-1.5 animate-pulse">
              <Spinner size="sm" className="text-accent" />
              生成中...
            </span>
          ) : aiResponse ? (
            <span className="text-[10px] text-success font-medium">完了</span>
          ) : null}
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
        ) : isGenerating && !streamingText ? (
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
              <div className="chat-header text-[10px] text-content-secondary mb-0.5">
                AI アシスタント
              </div>
              <div className="chat-bubble bg-accent/10 text-content text-[13px] leading-relaxed min-h-0 font-medium whitespace-pre-wrap">
                {displayText}
                {isGenerating && streamingText && (
                  <span className="inline-block w-0.5 h-3.5 bg-accent ml-0.5 animate-pulse" />
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
