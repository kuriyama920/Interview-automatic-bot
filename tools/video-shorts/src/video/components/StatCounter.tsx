/**
 * アニメーション数値カウンター
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

interface StatCounterProps {
  value: number
  suffix?: string
  prefix?: string
  label: string
  startFrame: number
  duration?: number
  color?: string
}

export const StatCounter: React.FC<StatCounterProps> = ({
  value,
  suffix = '',
  prefix = '',
  label,
  startFrame,
  duration = 30,
  color = BRAND_COLORS.accent,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  if (frame < startFrame) return null

  const localFrame = frame - startFrame

  const opacity = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  })

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 150 },
  })

  const currentValue = Math.round(
    interpolate(localFrame, [0, duration], [0, value], {
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    })
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <span
        style={{
          fontSize: 80,
          fontWeight: 700,
          color,
          fontFamily: BRAND.font,
          lineHeight: 1,
        }}
      >
        {prefix}
        {currentValue.toLocaleString()}
        {suffix}
      </span>
      <span
        style={{
          fontSize: 24,
          fontWeight: 500,
          color: BRAND_COLORS.textSecondary,
          fontFamily: BRAND.font,
        }}
      >
        {label}
      </span>
    </div>
  )
}
