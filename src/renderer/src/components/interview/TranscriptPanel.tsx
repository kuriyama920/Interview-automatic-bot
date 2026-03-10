/**
 * 文字起こしパネル
 * チャットバブルUI + 自動スクロール
 */

import { useRef, useEffect, useCallback } from 'react'
import { useInterview } from '../../contexts/InterviewContext'
import { RecordingControls } from './RecordingControls'
import { AudioSourceToggle } from './AudioSourceToggle'
import { MicrophoneIcon } from '../ui/icons'

function TypingIndicator() {
  return (
    <div className="chat chat-start">
      <div className="chat-bubble bg-surface-tertiary text-content py-2 px-4 min-h-0">
        <span className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-content-tertiary rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-content-tertiary rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-content-tertiary rounded-full animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  )
}

interface ChatBubbleProps {
  text: string
  source?: 'mic' | 'system'
  isInterim?: boolean
  showLabel?: boolean
}

function ChatBubble({ text, source, isInterim, showLabel }: ChatBubbleProps) {
  const isInterviewer = source === 'system'
  const alignment = isInterviewer ? 'chat-start' : 'chat-end'

  return (
    <div className={`chat ${alignment}`}>
      {showLabel && (
        <div className="chat-header text-[10px] font-semibold mb-0.5">
          <span className={isInterviewer ? 'text-error' : 'text-accent'}>
            {isInterviewer ? '面接官' : 'あなた'}
          </span>
        </div>
      )}
      <div
        className={`chat-bubble text-[13px] leading-relaxed min-h-0 ${
          isInterviewer
            ? 'bg-surface-tertiary text-content'
            : 'bg-accent text-white'
        } ${isInterim ? 'opacity-60' : ''}`}
      >
        {text}
        {isInterim && (
          <span className="inline-block w-0.5 h-3.5 bg-current ml-0.5 animate-pulse" />
        )}
      </div>
    </div>
  )
}

export function TranscriptPanel() {
  const { transcripts, currentText, currentSource, isCapturing } = useInterview()

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
  }, [transcripts, currentText])

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-border/50">
      <RecordingControls />

      {/* 文字起こし本文 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-4"
      >
        {transcripts.length === 0 && !currentText ? (
          isCapturing ? (
            <div className="px-2">
              <TypingIndicator />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-3">
                <MicrophoneIcon className="w-8 h-8 text-content-tertiary mx-auto" />
                <p className="text-content-tertiary text-sm">
                  録音を開始すると、ここに文字起こしが表示されます
                </p>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-1">
            {transcripts.map((t, i) => {
              const prevSource = i > 0 ? transcripts[i - 1].source : undefined
              const showLabel = t.source !== prevSource
              return (
                <ChatBubble
                  key={i}
                  text={t.text}
                  source={t.source}
                  showLabel={showLabel}
                />
              )
            })}
            {currentText && (
              <ChatBubble
                text={currentText}
                source={currentSource}
                isInterim
                showLabel={
                  transcripts.length === 0 ||
                  currentSource !== transcripts[transcripts.length - 1].source
                }
              />
            )}
            {isCapturing && !currentText && transcripts.length > 0 && (
              <TypingIndicator />
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <AudioSourceToggle />
    </div>
  )
}
