/**
 * Feature Highlight テンプレート
 *
 * 構成:
 *   0-3秒 (0-89f):    フック（ヘッドライン）
 *   3-8秒 (90-239f):  問題提示（サブヘッドライン）
 *   8-20秒 (240-599f): 解決策（3ポイント）
 *   20-25秒 (600-749f): 社会的証明
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

export const FeatureHighlight: React.FC<VideoTemplateProps> = ({
  headline,
  subheadline,
  bodyText,
  ctaText,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill>
      {/* 背景 */}
      <Background variant="mesh" />

      {/* ロゴ */}
      <LogoWatermark position="top" showTagline />

      {/* セクション1: フック (0-3秒) */}
      <HookSection frame={frame} fps={fps} headline={headline} />

      {/* セクション2: 問題提示 (3-8秒) */}
      <ProblemSection frame={frame} subheadline={subheadline} />

      {/* セクション3: 解決策 (8-20秒) */}
      <SolutionSection frame={frame} bodyText={bodyText} />

      {/* セクション4: 社会的証明 (20-25秒) */}
      <SocialProofSection frame={frame} fps={fps} />

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
          top: '35%',
          left: 60,
          right: 60,
          textAlign: 'center',
        }}
      >
        <TextReveal
          text={headline}
          startFrame={0}
          variant="headline"
          style={{ fontSize: 72, textAlign: 'center' }}
        />
      </div>
    </AbsoluteFill>
  )
}

const ProblemSection: React.FC<{
  frame: number
  subheadline: string
}> = ({ frame, subheadline }) => {
  const sectionStart = 90 // 3秒
  const sectionEnd = 240 // 8秒

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
        {/* アイコン */}
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            fontSize: 40,
          }}
        >
          <span style={{ color: BRAND_COLORS.error }}>!</span>
        </div>

        <TextReveal
          text={subheadline}
          startFrame={sectionStart + 5}
          variant="subheadline"
          style={{ fontSize: 42, textAlign: 'center', color: BRAND_COLORS.text }}
        />
      </div>
    </AbsoluteFill>
  )
}

const SolutionSection: React.FC<{
  frame: number
  bodyText: readonly string[]
}> = ({ frame, bodyText }) => {
  const sectionStart = 240 // 8秒
  const sectionEnd = 600 // 20秒

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
          top: '22%',
          left: 60,
          right: 60,
        }}
      >
        {/* セクションタイトル */}
        <TextReveal
          text={`${BRAND.name}なら`}
          startFrame={sectionStart + 5}
          variant="accent"
          style={{ textAlign: 'center', marginBottom: 48 }}
        />

        {/* ポイントリスト */}
        <TextRevealList
          items={bodyText}
          startFrame={sectionStart + 25}
          intervalFrames={60}
          variant="body"
          bulletStyle="check"
          style={{
            padding: '32px 40px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            borderRadius: 24,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0, 0, 0, 0.06)',
          }}
        />
      </div>
    </AbsoluteFill>
  )
}

const SocialProofSection: React.FC<{
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
            backgroundColor: 'rgba(59, 130, 246, 0.05)',
            borderRadius: 24,
            border: `2px solid ${BRAND_COLORS.accent}`,
          }}
        >
          <div
            style={{
              fontSize: 28,
              color: BRAND_COLORS.textSecondary,
              fontFamily: BRAND.font,
              marginBottom: 16,
            }}
          >
            面接対策にかかる時間を
          </div>
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: BRAND_COLORS.accent,
              fontFamily: BRAND.font,
              lineHeight: 1.2,
            }}
          >
            大幅短縮
          </div>
          <div
            style={{
              fontSize: 24,
              color: BRAND_COLORS.textSecondary,
              fontFamily: BRAND.font,
              marginTop: 16,
            }}
          >
            AIがリアルタイムでサポート
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
