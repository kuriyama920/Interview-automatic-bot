/**
 * テキスト表示アニメーション
 */

import React from 'react'
import {
  interpolate,
  useCurrentFrame,
  Easing,
  spring,
  useVideoConfig,
} from 'remotion'
import { BRAND, BRAND_COLORS } from '../constants'

interface TextRevealProps {
  text: string
  startFrame: number
  style?: React.CSSProperties
  variant?: 'headline' | 'subheadline' | 'body' | 'accent'
  delay?: number
}

const VARIANT_STYLES: Record<
  NonNullable<TextRevealProps['variant']>,
  React.CSSProperties
> = {
  headline: {
    fontSize: 64,
    fontWeight: 700,
    color: BRAND_COLORS.text,
    lineHeight: 1.3,
  },
  subheadline: {
    fontSize: 36,
    fontWeight: 500,
    color: BRAND_COLORS.textSecondary,
    lineHeight: 1.5,
  },
  body: {
    fontSize: 32,
    fontWeight: 400,
    color: BRAND_COLORS.text,
    lineHeight: 1.6,
  },
  accent: {
    fontSize: 40,
    fontWeight: 600,
    color: BRAND_COLORS.accent,
    lineHeight: 1.4,
  },
}

export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  startFrame,
  style = {},
  variant = 'body',
  delay = 0,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const adjustedStart = startFrame + delay

  if (frame < adjustedStart) return null

  const localFrame = frame - adjustedStart

  const opacity = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  const translateY = spring({
    frame: localFrame,
    fps,
    config: { damping: 15, stiffness: 100 },
    from: 30,
    to: 0,
  })

  const variantStyle = VARIANT_STYLES[variant]

  return (
    <div
      style={{
        fontFamily: BRAND.font,
        ...variantStyle,
        ...style,
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      {text}
    </div>
  )
}

/** 複数行を順番に表示 */
interface TextRevealListProps {
  items: readonly string[]
  startFrame: number
  intervalFrames?: number
  variant?: TextRevealProps['variant']
  style?: React.CSSProperties
  bulletStyle?: 'dot' | 'check' | 'number' | 'none'
}

export const TextRevealList: React.FC<TextRevealListProps> = ({
  items,
  startFrame,
  intervalFrames = 20,
  variant = 'body',
  style = {},
  bulletStyle = 'check',
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, ...style }}>
      {items.map((item, i) => {
        const bullet =
          bulletStyle === 'dot'
            ? '\u2022 '
            : bulletStyle === 'check'
              ? '\u2713 '
              : bulletStyle === 'number'
                ? `${i + 1}. `
                : ''
        return (
          <TextReveal
            key={i}
            text={`${bullet}${item}`}
            startFrame={startFrame + i * intervalFrames}
            variant={variant}
          />
        )
      })}
    </div>
  )
}
