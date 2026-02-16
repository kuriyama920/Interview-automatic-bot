/**
 * ブランドロゴ・ウォーターマーク
 */

import React from 'react'
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion'
import { BRAND, BRAND_COLORS } from '../constants'

interface LogoWatermarkProps {
  position?: 'top' | 'bottom'
  showTagline?: boolean
}

export const LogoWatermark: React.FC<LogoWatermarkProps> = ({
  position = 'top',
  showTagline = false,
}) => {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  const translateY = interpolate(frame, [0, 15], [-20, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  const isTop = position === 'top'

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          [isTop ? 'top' : 'bottom']: 80,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundColor: BRAND_COLORS.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 24,
              fontWeight: 700,
              fontFamily: BRAND.font,
            }}
          >
            IB
          </div>
          <span
            style={{
              fontSize: 32,
              fontWeight: 600,
              color: BRAND_COLORS.text,
              fontFamily: BRAND.font,
            }}
          >
            {BRAND.name}
          </span>
        </div>
        {showTagline && (
          <span
            style={{
              fontSize: 20,
              color: BRAND_COLORS.textSecondary,
              marginTop: 8,
              fontFamily: BRAND.font,
            }}
          >
            {BRAND.tagline}
          </span>
        )}
      </div>
    </AbsoluteFill>
  )
}
