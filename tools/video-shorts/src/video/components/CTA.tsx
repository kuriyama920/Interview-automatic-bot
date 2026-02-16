/**
 * CTA (Call to Action) オーバーレイ
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
import { BRAND, BRAND_COLORS } from '../constants'

interface CTAProps {
  text: string
  startFrame?: number
}

export const CTA: React.FC<CTAProps> = ({ text, startFrame }) => {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  const ctaStart = startFrame ?? durationInFrames - fps * 6

  if (frame < ctaStart) return null

  const localFrame = frame - ctaStart

  const scale = spring({
    frame: localFrame,
    fps,
    config: { damping: 12, stiffness: 120 },
  })

  const buttonOpacity = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  })

  const urlOpacity = interpolate(localFrame, [10, 25], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  })

  const pulseScale = interpolate(
    localFrame % 45,
    [0, 22, 45],
    [1, 1.03, 1],
    { extrapolateRight: 'clamp' }
  )

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: 200,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            opacity: buttonOpacity,
            transform: `scale(${scale * pulseScale})`,
          }}
        >
          <div
            style={{
              backgroundColor: BRAND_COLORS.accent,
              color: '#ffffff',
              fontSize: 36,
              fontWeight: 700,
              fontFamily: BRAND.font,
              padding: '24px 64px',
              borderRadius: 60,
              boxShadow: '0 8px 32px rgba(59, 130, 246, 0.4)',
            }}
          >
            {text}
          </div>
        </div>

        <div
          style={{
            opacity: urlOpacity,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 22,
              color: BRAND_COLORS.textSecondary,
              fontFamily: BRAND.font,
            }}
          >
            詳しくはこちら
          </span>
          <span
            style={{
              fontSize: 28,
              color: BRAND_COLORS.accent,
              fontWeight: 600,
              fontFamily: BRAND.font,
            }}
          >
            {BRAND.websiteUrl.replace('https://', '')}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  )
}
