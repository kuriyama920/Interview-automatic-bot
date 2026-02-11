'use client'

import { useEffect, useState, useRef } from 'react'

/* ─── 1. TranscriptionDemo ──────────────────────────────────────────── */

const STT_LINES = [
  { speaker: '面接官', text: '志望動機を教えてください。' },
  { speaker: 'あなた', text: 'はい、御社の理念に共感し...' },
  { speaker: '面接官', text: '5年後のキャリアプランはありますか？' },
]

export function TranscriptionDemo() {
  const [lineIdx, setLineIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const line = STT_LINES[lineIdx]
    if (charIdx < line.text.length) {
      timerRef.current = setTimeout(() => setCharIdx((c) => c + 1), 50)
    } else {
      timerRef.current = setTimeout(() => {
        const next = (lineIdx + 1) % STT_LINES.length
        setLineIdx(next)
        setCharIdx(0)
      }, 2000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [lineIdx, charIdx])

  return (
    <div className="h-full flex flex-col p-4">
      {/* Recording status */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-error animate-pulse" />
        <span className="text-[10px] font-medium text-content-secondary">録音中</span>
        <MiniWaveform />
      </div>

      {/* Transcript lines */}
      <div className="flex-1 space-y-2.5 overflow-hidden">
        {STT_LINES.map((line, i) => {
          const isCurrentLine = i === lineIdx
          const isPastLine = i < lineIdx || (i === 0 && lineIdx === STT_LINES.length - 1 && i < lineIdx)
          const visibleText = isCurrentLine
            ? line.text.slice(0, charIdx)
            : isPastLine || (lineIdx > i)
              ? line.text
              : ''

          if (!visibleText) return null

          return (
            <div key={i} className={isCurrentLine ? '' : 'opacity-50'}>
              <div
                className={`text-[9px] font-medium mb-0.5 ${
                  line.speaker === '面接官' ? 'text-accent' : 'text-success'
                }`}
              >

                {line.speaker}
              </div>
              <p className="text-[11px] leading-relaxed text-content">
                {visibleText}
                {isCurrentLine && charIdx < line.text.length && (
                  <span className="inline-block w-0.5 h-2.5 bg-accent ml-0.5 animate-blink" />
                )}
              </p>
            </div>
          )
        })}
      </div>

      {/* Waveform footer */}
      <div className="pt-2 border-t border-border/20 mt-auto">
        <div className="flex items-center justify-center">
          <LargeWaveform />
        </div>
      </div>
    </div>
  )
}

/* ─── 2. AIResponseDemo ─────────────────────────────────────────────── */

const AI_TEXT =
  '「御社の"お客様第一"という理念に深く共感いたしました。前職での接客経験を通じて、お客様の声に寄り添うことの大切さを実感しており、御社でさらに成長したいと考えております。」'

export function AIResponseDemo() {
  const [charIdx, setCharIdx] = useState(0)
  const [showScore, setShowScore] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (charIdx < AI_TEXT.length) {
      timerRef.current = setTimeout(() => setCharIdx((c) => c + 1), 30)
    } else if (!showScore) {
      timerRef.current = setTimeout(() => setShowScore(true), 500)
    } else {
      timerRef.current = setTimeout(() => {
        setCharIdx(0)
        setShowScore(false)
      }, 4000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [charIdx, showScore])

  const progress = Math.min((charIdx / AI_TEXT.length) * 100, 100)

  return (
    <div className="h-full flex flex-col p-4">
      {/* AI header */}
      <div className="flex items-center gap-2 mb-3">
        <SparkleIcon className="w-3.5 h-3.5 text-accent" />
        <span className="text-[10px] font-medium text-content-secondary">AI 回答提案</span>
        {charIdx < AI_TEXT.length && charIdx > 0 && (
          <span className="ml-auto text-[9px] text-accent animate-pulse">生成中...</span>
        )}
      </div>

      {/* Response text */}
      <div className="flex-1 overflow-hidden">
        {charIdx > 0 ? (
          <div>
            <div className="text-[10px] text-content-secondary mb-1.5">おすすめの回答：</div>
            <p className="text-[11px] leading-relaxed text-content">
              {AI_TEXT.slice(0, charIdx)}
              {charIdx < AI_TEXT.length && (
                <span className="inline-block w-0.5 h-2.5 bg-accent ml-0.5 animate-blink" />
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <SparkleIcon className="w-6 h-6 text-accent/30 mx-auto mb-1" />
              <p className="text-[10px] text-content-tertiary">回答を準備中...</p>
            </div>
          </div>
        )}
      </div>

      {/* Score bar */}
      {showScore && (
        <div className="mt-2 pt-2 border-t border-border/20 animate-fade-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-content-secondary">マッチ度</span>
            <span className="text-[9px] font-medium text-accent">85%</span>
          </div>
          <div className="h-1 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progress >= 100 ? 85 : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── 3. DocumentDemo ───────────────────────────────────────────────── */

const DOCUMENTS = [
  { name: '履歴書.pdf', pages: 2 },
  { name: '求人票.pdf', pages: 5 },
  { name: '職務経歴書.docx', pages: 3 },
]

export function DocumentDemo() {
  const [visibleDocs, setVisibleDocs] = useState(0)
  const [analyzing, setAnalyzing] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (visibleDocs < DOCUMENTS.length) {
      timerRef.current = setTimeout(() => {
        setAnalyzing(visibleDocs)
        setTimeout(() => {
          setAnalyzing(-1)
          setVisibleDocs((v) => v + 1)
        }, 1200)
      }, 800)
    } else {
      timerRef.current = setTimeout(() => {
        setVisibleDocs(0)
        setAnalyzing(-1)
      }, 5000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [visibleDocs])

  return (
    <div className="h-full flex flex-col p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <DocIcon className="w-3.5 h-3.5 text-accent" />
        <span className="text-[10px] font-medium text-content-secondary">
          ドキュメント連携
        </span>
      </div>

      {/* Document list */}
      <div className="flex-1 space-y-2">
        {DOCUMENTS.map((doc, i) => {
          const isVisible = i < visibleDocs || i === visibleDocs && analyzing === i
          const isAnalyzing = analyzing === i
          const isDone = i < visibleDocs

          if (!isVisible) return null

          return (
            <div
              key={i}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-surface-secondary/80 border border-border/30 animate-fade-in"
            >
              <div className="w-7 h-7 rounded-md bg-accent/10 flex items-center justify-center shrink-0">
                <FileIcon className="w-3.5 h-3.5 text-accent/70" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-content truncate">
                  {doc.name}
                </div>
                <div className="text-[9px] text-content-tertiary">{doc.pages} ページ</div>
              </div>
              <div className="shrink-0">
                {isAnalyzing ? (
                  <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                ) : isDone ? (
                  <CheckCircle className="w-4 h-4 text-success" />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div className="mt-auto pt-2 border-t border-border/20">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-content-tertiary">
            {visibleDocs >= DOCUMENTS.length
              ? 'すべて解析完了'
              : analyzing >= 0
                ? '解析中...'
                : 'アップロード中...'}
          </span>
          <span className="text-[9px] font-medium text-accent">
            {visibleDocs}/{DOCUMENTS.length}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ─── Shared mini icons ─────────────────────────────────────────────── */

function MiniWaveform() {
  return (
    <div className="flex items-center gap-[1.5px] h-2.5 ml-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="w-[1.5px] rounded-full bg-error/50 animate-waveform"
          style={{
            animationDelay: `${i * 0.08}s`,
            animationDuration: `${0.35 + (i % 3) * 0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

function LargeWaveform() {
  return (
    <div className="flex items-center gap-[2px] h-5">
      {Array.from({ length: 24 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-accent/40 animate-waveform"
          style={{
            animationDelay: `${i * 0.06}s`,
            animationDuration: `${0.3 + (i % 4) * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
      />
    </svg>
  )
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    </svg>
  )
}

function CheckCircle({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  )
}
