/**
 * Stats Promo テンプレート
 *
 * 構成:
 *   0-3秒 (0-89f):    フック（ヘッドライン）
 *   3-8秒 (90-239f):  サブヘッドライン
 *   8-20秒 (240-599f): 統計カウンター（3つの数値）
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
} from 'remotion'
import { Background } from '../components/Background'
import { LogoWatermark } from '../components/LogoWatermark'
import { CTA } from '../components/CTA'
import { TextReveal } from '../components/TextReveal'
import { StatCounter } from '../components/StatCounter'
import { BRAND, BRAND_COLORS } from '../constants'
import type { VideoTemplateProps } from '../../types'

const STATS = [
  { value: 95, suffix: '%', label: '音声認識精度' },
  { value: 3, suffix: '秒', label: 'AI回答生成速度' },
  { value: 10, suffix: '万+', label: '対応質問パターン' },
] as const

export const StatsPromo: React.FC<VideoTemplateProps> = ({
  headline,
  subheadline,
  bodyText,
  ctaText,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill>
      <Background variant="mesh" />
      <LogoWatermark position="top" showTagline />

      <HookSection frame={frame} fps={fps} headline={headline} />
      <SubheadSection frame={frame} subheadline={subheadline} />
      <StatsSection frame={frame} bodyText={bodyText} />
      <SummarySection frame={frame} fps={fps} />
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
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 32px',
            fontSize: 48,
          }}
        >
          <span>📊</span>
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

const SubheadSection: React.FC<{
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

const StatsSection: React.FC<{
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
          text="数字で見る実力"
          startFrame={sectionStart + 5}
          variant="accent"
          style={{ textAlign: 'center', marginBottom: 48, fontSize: 36 }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 40,
            padding: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            borderRadius: 24,
            backdropFilter: 'blur(10px)',
          }}
        >
          {STATS.map((stat, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <StatCounter
                value={stat.value}
                suffix={stat.suffix}
                label={bodyText[i] ?? stat.label}
                startFrame={sectionStart + 20 + i * 50}
                color={i === 0 ? BRAND_COLORS.accent : i === 1 ? BRAND_COLORS.success : BRAND_COLORS.text}
              />
            </div>
          ))}
        </div>
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
            backgroundColor: 'rgba(16, 185, 129, 0.05)',
            borderRadius: 24,
            border: `2px solid ${BRAND_COLORS.success}`,
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: BRAND_COLORS.text,
              fontFamily: BRAND.font,
              marginBottom: 16,
            }}
          >
            実績が証明する品質
          </div>
          <div
            style={{
              fontSize: 24,
              color: BRAND_COLORS.textSecondary,
              fontFamily: BRAND.font,
            }}
          >
            テクノロジーの力で面接を変える
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
