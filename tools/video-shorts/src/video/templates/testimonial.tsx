/**
 * Testimonial テンプレート
 *
 * 構成:
 *   0-3秒 (0-89f):    フック（ヘッドライン）
 *   3-8秒 (90-239f):  ユーザーの悩み（サブヘッドライン）
 *   8-20秒 (240-599f): 体験談（3ポイント）
 *   20-25秒 (600-749f): 満足メッセージ
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

export const Testimonial: React.FC<VideoTemplateProps> = ({
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

      <HookSection frame={frame} fps={fps} headline={headline} />
      <PainSection frame={frame} subheadline={subheadline} />
      <StorySection frame={frame} bodyText={bodyText} />
      <SatisfactionSection frame={frame} fps={fps} />
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
        {/* 引用符アイコン */}
        <div
          style={{
            fontSize: 80,
            color: BRAND_COLORS.accent,
            fontFamily: 'serif',
            lineHeight: 1,
            marginBottom: 16,
            opacity: 0.3,
          }}
        >
          &ldquo;
        </div>

        <TextReveal
          text={headline}
          startFrame={0}
          variant="headline"
          style={{ fontSize: 64, textAlign: 'center' }}
        />
      </div>
    </AbsoluteFill>
  )
}

const PainSection: React.FC<{
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
          top: '30%',
          left: 60,
          right: 60,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: 40,
          }}
        >
          <span>😰</span>
        </div>

        <TextReveal
          text={subheadline}
          startFrame={sectionStart + 5}
          variant="subheadline"
          style={{ fontSize: 38, textAlign: 'center' }}
        />
      </div>
    </AbsoluteFill>
  )
}

const StorySection: React.FC<{
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
          text="使ってみたら..."
          startFrame={sectionStart + 5}
          variant="accent"
          style={{ textAlign: 'center', marginBottom: 40, fontSize: 36 }}
        />

        <div
          style={{
            padding: '32px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: 24,
            border: `2px solid rgba(59, 130, 246, 0.15)`,
          }}
        >
          {bodyText.map((text, i) => (
            <TestimonialBubble
              key={i}
              text={text}
              frame={frame}
              startFrame={sectionStart + 25 + i * 70}
              isRight={i % 2 === 1}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  )
}

const TestimonialBubble: React.FC<{
  text: string
  frame: number
  startFrame: number
  isRight: boolean
}> = ({ text, frame, startFrame, isRight }) => {
  if (frame < startFrame) return null

  const localFrame = frame - startFrame

  const opacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  })

  const translateY = interpolate(localFrame, [0, 15], [20, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isRight ? 'flex-end' : 'flex-start',
        marginBottom: 16,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          padding: '16px 24px',
          backgroundColor: isRight
            ? BRAND_COLORS.accent
            : BRAND_COLORS.backgroundSecondary,
          borderRadius: 20,
          maxWidth: '85%',
        }}
      >
        <span
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: isRight ? '#ffffff' : BRAND_COLORS.text,
            fontFamily: BRAND.font,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  )
}

const SatisfactionSection: React.FC<{
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
          top: '30%',
          left: 60,
          right: 60,
          textAlign: 'center',
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            padding: '48px 40px',
            background: `linear-gradient(135deg, ${BRAND_COLORS.accent}, #8b5cf6)`,
            borderRadius: 24,
            boxShadow: '0 12px 40px rgba(59, 130, 246, 0.3)',
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
            }}
          >
            😊
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: BRAND.font,
              marginBottom: 12,
            }}
          >
            もっと早く知りたかった！
          </div>
          <div
            style={{
              fontSize: 22,
              color: 'rgba(255, 255, 255, 0.85)',
              fontFamily: BRAND.font,
            }}
          >
            多くのユーザーが実感しています
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
