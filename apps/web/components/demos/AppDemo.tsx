'use client'

import { useEffect, useState, useRef } from 'react'

/** 面接の会話データ */
interface Turn {
  speaker: '面接官' | 'あなた'
  text: string
  /** この質問に対するAI提案（面接官ターンのみ） */
  aiSuggestion?: string
}

const CONVERSATION: Turn[] = [
  {
    speaker: '面接官',
    text: 'それでは面接を始めます。まず簡単に自己紹介をお願いいたします。',
    aiSuggestion:
      '「田中と申します。前職ではIT企業で法人営業として3年間勤務し、年間売上目標を120%達成してまいりました。お客様の課題を丁寧にヒアリングし、最適な提案をすることに注力しておりました。」',
  },
  {
    speaker: 'あなた',
    text: '田中と申します。前職ではIT企業で法人営業を3年間担当し、お客様の課題解決に注力してまいりました。本日はよろしくお願いいたします。',
  },
  {
    speaker: '面接官',
    text: 'ありがとうございます。前職を退職された理由を教えていただけますか。',
    aiSuggestion:
      '「前職ではやりがいを感じておりましたが、営業で培ったお客様理解を活かし、より企画やマーケティングに近い立場で商品開発に携わりたいと考え、転職を決意いたしました。」',
  },
  {
    speaker: 'あなた',
    text: '前職ではやりがいを感じておりましたが、お客様の声を商品に反映する企画寄りの仕事に挑戦したいと考え、転職を決意いたしました。',
  },
  {
    speaker: '面接官',
    text: 'なるほど。では弊社を志望された理由をお聞かせいただけますか。',
    aiSuggestion:
      '「御社は顧客視点を大切にした商品開発に力を入れていらっしゃると伺いました。営業経験で培ったお客様理解と課題発見力を活かし、御社のプロダクト成長に貢献したいと考えております。」',
  },
]

const CHAR_SPEED = 45
const CHAR_SPEED_AI = 20
const AI_START_DELAY = 8
const TURN_PAUSE = 1500
const LOOP_PAUSE = 4000

export function AppDemo() {
  const [turnIdx, setTurnIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [aiCharIdx, setAiCharIdx] = useState(0)
  const [phase, setPhase] = useState<'typing' | 'pause' | 'loop'>('typing')
  const timerRef = useRef<ReturnType<typeof setTimeout>>()
  const aiTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const scrollRef = useRef<HTMLDivElement>(null)

  const currentTurn = CONVERSATION[turnIdx]
  const isInterviewer = currentTurn?.speaker === '面接官'
  const aiText = currentTurn?.aiSuggestion ?? ''

  // 会話テキストのタイプライター
  useEffect(() => {
    if (phase !== 'typing' || !currentTurn) return
    if (charIdx < currentTurn.text.length) {
      timerRef.current = setTimeout(() => setCharIdx((c) => c + 1), CHAR_SPEED)
    } else {
      // ターン終了 → 一時停止後に次のターンへ
      const isLast = turnIdx >= CONVERSATION.length - 1
      timerRef.current = setTimeout(() => {
        if (isLast) {
          setPhase('loop')
        } else {
          setPhase('pause')
        }
      }, TURN_PAUSE)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase, charIdx, turnIdx, currentTurn])

  // AI提案のタイプライター（面接官ターンで文字が一定数進んだら開始）
  useEffect(() => {
    if (phase !== 'typing') return
    if (!isInterviewer || !aiText) return
    if (charIdx < AI_START_DELAY) return
    if (aiCharIdx < aiText.length) {
      aiTimerRef.current = setTimeout(() => setAiCharIdx((c) => c + 1), CHAR_SPEED_AI)
    }
    return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current) }
  }, [phase, charIdx, aiCharIdx, isInterviewer, aiText])

  // pause → 次のターンへ
  useEffect(() => {
    if (phase !== 'pause') return
    timerRef.current = setTimeout(() => {
      setTurnIdx((t) => t + 1)
      setCharIdx(0)
      setAiCharIdx(0)
      setPhase('typing')
    }, 200)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase])

  // loop → リセット
  useEffect(() => {
    if (phase !== 'loop') return
    timerRef.current = setTimeout(() => {
      setTurnIdx(0)
      setCharIdx(0)
      setAiCharIdx(0)
      setPhase('typing')
    }, LOOP_PAUSE)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [phase])

  // スクロールを最下部に追従
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [turnIdx, charIdx])

  // 完了済みのターン + 現在タイプ中のターン
  const visibleTurns = CONVERSATION.slice(0, turnIdx + 1)

  // 現在のAI提案テキスト
  const currentAiText = isInterviewer && aiText ? aiText.slice(0, aiCharIdx) : ''
  const isAiGenerating = isInterviewer && aiCharIdx > 0 && aiCharIdx < aiText.length
  const isAiDone = isInterviewer && aiCharIdx >= aiText.length && aiText.length > 0
  const latestAiSuggestion = !isInterviewer
    ? CONVERSATION.slice(0, turnIdx).reverse().find((t) => t.aiSuggestion)?.aiSuggestion ?? ''
    : ''

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 h-full min-h-[320px] md:min-h-[420px] text-left">
      {/* Left: Transcript panel */}
      <div className="md:col-span-5 border-b md:border-b-0 md:border-r border-border/50 p-4 md:p-5 flex flex-col">
        {/* Recording indicator */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              phase === 'typing' ? 'bg-error animate-pulse' : 'bg-success'
            }`}
          />
          <span className="text-[11px] font-medium text-content-secondary">
            {phase === 'typing' ? '録音中' : '完了'}
          </span>
          {phase === 'typing' && <Waveform />}
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
          {visibleTurns.map((turn, i) => {
            const isCurrent = i === turnIdx
            const displayText = isCurrent
              ? turn.text.slice(0, charIdx)
              : turn.text
            const isTyping = isCurrent && phase === 'typing' && charIdx < turn.text.length

            return (
              <div key={i} className={isCurrent ? '' : 'opacity-50'}>
                <div
                  className={`text-[10px] font-semibold mb-0.5 ${
                    turn.speaker === '面接官' ? 'text-accent' : 'text-success'
                  }`}
                >
                  {turn.speaker}
                </div>
                <p className="text-[13px] leading-relaxed text-content">
                  {displayText}
                  {isTyping && (
                    <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink" />
                  )}
                </p>
              </div>
            )
          })}
        </div>

        {/* Audio source */}
        <div className="mt-2 pt-2 border-t border-border/30 flex items-center gap-2">
          <MicIcon className="w-3 h-3 text-content-tertiary" />
          <span className="text-[10px] text-content-tertiary">マイク + システム音声</span>
        </div>
      </div>

      {/* Right: AI response panel */}
      <div className="md:col-span-7 p-4 md:p-5 flex flex-col bg-accent/[0.02]">
        {/* AI header */}
        <div className="flex items-center gap-2 mb-3">
          <SparkleIcon
            className={`w-4 h-4 shrink-0 ${
              currentAiText || latestAiSuggestion ? 'text-accent' : 'text-content-tertiary/40'
            }`}
          />
          <span className="text-[11px] font-medium text-content-secondary">AI 回答提案</span>
          {isAiGenerating && (
            <span className="ml-auto text-[10px] text-accent animate-pulse shrink-0">
              先行生成中...
            </span>
          )}
          {(isAiDone || latestAiSuggestion) && !isAiGenerating && (
            <span className="ml-auto text-[10px] text-success shrink-0">完了</span>
          )}
        </div>

        {/* AI response */}
        <div className="flex-1 overflow-y-auto">
          {currentAiText ? (
            <div>
              <div className="text-[10px] text-content-secondary mb-1">おすすめの回答：</div>
              <p className="text-[13px] leading-relaxed text-content">
                {currentAiText}
                {isAiGenerating && (
                  <span className="inline-block w-0.5 h-3 bg-accent ml-0.5 animate-blink" />
                )}
              </p>
            </div>
          ) : latestAiSuggestion ? (
            <div className="opacity-50">
              <div className="text-[10px] text-content-secondary mb-1">前の回答提案：</div>
              <p className="text-[13px] leading-relaxed text-content">{latestAiSuggestion}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <SparkleIcon className="w-6 h-6 text-accent/20 mx-auto mb-1" />
                <p className="text-[11px] text-content-tertiary">質問を認識しています...</p>
              </div>
            </div>
          )}
        </div>

        {/* Tips footer (when AI done for interviewer turn) */}
        {isAiDone && (
          <div className="mt-2 pt-2 border-t border-border/30 animate-fade-in">
            <div className="flex items-center gap-1.5">
              <CheckIcon className="w-3 h-3 text-success shrink-0" />
              <span className="text-[10px] text-content-secondary">
                ポイント：前向きな理由 + 志望動機との一貫性
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Animated audio waveform bars */
function Waveform() {
  return (
    <div className="flex items-center gap-[2px] h-3 ml-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-accent/60 animate-waveform"
          style={{
            animationDelay: `${i * 0.07}s`,
            animationDuration: `${0.4 + (i % 3) * 0.15}s`,
          }}
        />
      ))}
    </div>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}
