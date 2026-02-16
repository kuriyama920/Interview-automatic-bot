/**
 * Demo Showcase テンプレート
 *
 * 構成:
 *   0-3秒 (0-89f):    フック（ヘッドライン）
 *   3-8秒 (90-239f):  課題（サブヘッドライン）
 *   8-20秒 (240-599f): デモステップ（3ステップ）
 *   20-25秒 (600-749f): 結果の表示
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
import { TextReveal } from '../components/TextReveal'
import { BRAND, BRAND_COLORS } from '../constants'
import type { VideoTemplateProps } from '../../types'

export const DemoShowcase: React.FC<VideoTemplateProps> = ({
  headline,
  subheadline,
  bodyText,
  ctaText,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill>
      <Background variant="solid" />
      <LogoWatermark position="top" showTagline />

      <HookSection frame={frame} fps={fps} headline={headline} />
      <ChallengeSection frame={frame} subheadline={subheadline} />
      <StepsSection frame={frame} bodyText={bodyText} />
      <ResultSection frame={frame} fps={fps} />
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
        <div
          style={{
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            fontSize: 48,
          }}
        >
          <span>🎯</span>
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

const ChallengeSection: React.FC<{
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

const StepsSection: React.FC<{
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
          top: '18%',
          left: 60,
          right: 60,
        }}
      >
        <TextReveal
          text="かんたん3ステップ"
          startFrame={sectionStart + 5}
          variant="accent"
          style={{ textAlign: 'center', marginBottom: 48, fontSize: 36 }}
        />

        {bodyText.map((step, i) => (
          <StepCard
            key={i}
            step={i + 1}
            text={step}
            frame={frame}
            startFrame={sectionStart + 30 + i * 70}
          />
        ))}
      </div>
    </AbsoluteFill>
  )
}

const StepCard: React.FC<{
  step: number
  text: string
  frame: number
  startFrame: number
}> = ({ step, text, frame, startFrame }) => {
  if (frame < startFrame) return null

  const localFrame = frame - startFrame

  const opacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
  })

  const translateX = interpolate(localFrame, [0, 15], [60, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        marginBottom: 24,
        padding: '24px 32px',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 20,
        border: '1px solid rgba(0, 0, 0, 0.06)',
        opacity,
        transform: `translateX(${translateX}px)`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: BRAND_COLORS.accent,
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          fontWeight: 700,
          fontFamily: BRAND.font,
          flexShrink: 0,
        }}
      >
        {step}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 500,
          color: BRAND_COLORS.text,
          fontFamily: BRAND.font,
        }}
      >
        {text}
      </div>
    </div>
  )
}

const ResultSection: React.FC<{
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

  const scale = interpolate(localFrame, [0, 15], [0.85, 1], {
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
            backgroundColor: BRAND_COLORS.accent,
            borderRadius: 24,
            boxShadow: '0 12px 40px rgba(59, 130, 246, 0.3)',
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: BRAND.font,
              marginBottom: 16,
            }}
          >
            面接本番でも安心
          </div>
          <div
            style={{
              fontSize: 24,
              color: 'rgba(255, 255, 255, 0.85)',
              fontFamily: BRAND.font,
            }}
          >
            AIがリアルタイムで回答をサポート
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
