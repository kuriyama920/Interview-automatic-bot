/**
 * Tip of the Day テンプレート
 *
 * 構成:
 *   0-3秒 (0-89f):    フック（ヘッドライン）
 *   3-8秒 (90-239f):  問題提示（サブヘッドライン）
 *   8-20秒 (240-599f): Tipsリスト（3ポイント）
 *   20-25秒 (600-749f): まとめ
 *   25-30秒 (750-899f): CTA
 */

import React from 'react'
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  spring,
} from 'remotion'
import { Background } from '../components/Background'
import { LogoWatermark } from '../components/LogoWatermark'
import { CTA } from '../components/CTA'
import { TextReveal, TextRevealList } from '../components/TextReveal'
import { BRAND, BRAND_COLORS } from '../constants'
import type { VideoTemplateProps } from '../../types'

export const TipOfDay: React.FC<VideoTemplateProps> = ({
  headline,
  subheadline,
  bodyText,
  ctaText,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill>
      <Background variant="gradient" />
      <LogoWatermark position="top" showTagline />

      {/* セクション1: フック (0-3秒) */}
      <HookSection frame={frame} fps={fps} headline={headline} />

      {/* セクション2: サブヘッドライン (3-8秒) */}
      <IntroSection frame={frame} subheadline={subheadline} />

      {/* セクション3: Tips リスト (8-20秒) */}
      <TipsSection frame={frame} bodyText={bodyText} />

      {/* セクション4: まとめ (20-25秒) */}
      <SummarySection frame={frame} fps={fps} />

      {/* セクション5: CTA (25-30秒) */}
      <CTA text={ctaText} startFrame={fps * 25} />
    </AbsoluteFill>
  )
}

const HookSection: React.FC<{
  frame: number
  fps: number
  headline: string
}> = ({ frame, fps, headline }) => {
  const sectionEnd = fps * 3

  const opacity = interpolate(
    frame,
    [0, 10, sectionEnd - 10, sectionEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: 60,
          right: 60,
          textAlign: 'center',
        }}
      >
        {/* 電球アイコン */}
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: 'rgba(251, 191, 36, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            fontSize: 48,
          }}
        >
          <span>💡</span>
        </div>

        <TextReveal
          text={headline}
          startFrame={0}
          variant="headline"
          style={{ fontSize: 68, textAlign: 'center' }}
        />
      </div>
    </AbsoluteFill>
  )
}

const IntroSection: React.FC<{
  frame: number
  subheadline: string
}> = ({ frame, subheadline }) => {
  const sectionStart = 90
  const sectionEnd = 240

  if (frame < sectionStart || frame > sectionEnd) return null

  const opacity = interpolate(
    frame,
    [sectionStart, sectionStart + 10, sectionEnd - 10, sectionEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          top: '35%',
          left: 60,
          right: 60,
          textAlign: 'center',
        }}
      >
        <TextReveal
          text={subheadline}
          startFrame={sectionStart + 5}
          variant="subheadline"
          style={{ fontSize: 40, textAlign: 'center' }}
        />
      </div>
    </AbsoluteFill>
  )
}

const TipsSection: React.FC<{
  frame: number
  bodyText: readonly string[]
}> = ({ frame, bodyText }) => {
  const sectionStart = 240
  const sectionEnd = 600

  if (frame < sectionStart || frame > sectionEnd) return null

  const opacity = interpolate(
    frame,
    [sectionStart, sectionStart + 10, sectionEnd - 10, sectionEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          top: '20%',
          left: 60,
          right: 60,
        }}
      >
        <TextReveal
          text="今日のTips"
          startFrame={sectionStart + 5}
          variant="accent"
          style={{ textAlign: 'center', marginBottom: 40, fontSize: 36 }}
        />

        <TextRevealList
          items={bodyText}
          startFrame={sectionStart + 25}
          intervalFrames={70}
          variant="body"
          bulletStyle="number"
          style={{
            padding: '32px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            borderRadius: 24,
            backdropFilter: 'blur(10px)',
            border: `2px solid rgba(251, 191, 36, 0.3)`,
          }}
        />
      </div>
    </AbsoluteFill>
  )
}

const SummarySection: React.FC<{
  frame: number
  fps: number
}> = ({ frame, fps }) => {
  const sectionStart = fps * 20
  const sectionEnd = fps * 25

  if (frame < sectionStart || frame > sectionEnd) return null

  const localFrame = frame - sectionStart

  const opacity = interpolate(
    frame,
    [sectionStart, sectionStart + 10, sectionEnd - 10, sectionEnd],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  )

  const scale = interpolate(localFrame, [0, 15], [0.9, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          top: '32%',
          left: 60,
          right: 60,
          textAlign: 'center',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            padding: '48px 40px',
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderRadius: 24,
            border: `2px solid ${BRAND_COLORS.accent}`,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: BRAND_COLORS.text,
              fontFamily: BRAND.font,
              marginBottom: 16,
            }}
          >
            AIで面接対策を効率化
          </div>
          <div
            style={{
              fontSize: 24,
              color: BRAND_COLORS.textSecondary,
              fontFamily: BRAND.font,
            }}
          >
            InterviewBotがリアルタイムでサポート
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
