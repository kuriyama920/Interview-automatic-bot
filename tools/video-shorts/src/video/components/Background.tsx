/**
 * アニメーション背景コンポーネント
 */

import React from 'react'
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { BRAND_COLORS } from '../constants'

interface BackgroundProps {
  variant?: 'gradient' | 'solid' | 'mesh'
}

export const Background: React.FC<BackgroundProps> = ({
  variant = 'gradient',
}) => {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()

  if (variant === 'solid') {
    return (
      <AbsoluteFill
        style={{ backgroundColor: BRAND_COLORS.background }}
      />
    )
  }

  if (variant === 'mesh') {
    return <MeshBackground frame={frame} durationInFrames={durationInFrames} />
  }

  return <GradientBackground frame={frame} durationInFrames={durationInFrames} />
}

const GradientBackground: React.FC<{
  frame: number
  durationInFrames: number
}> = ({ frame, durationInFrames }) => {
  const angle = interpolate(frame, [0, durationInFrames], [135, 225])

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg,
          ${BRAND_COLORS.background} 0%,
          ${BRAND_COLORS.backgroundSecondary} 40%,
          #eff6ff 70%,
          #dbeafe 100%)`,
      }}
    />
  )
}

const MeshBackground: React.FC<{
  frame: number
  durationInFrames: number
}> = ({ frame, durationInFrames }) => {
  const offset1 = interpolate(frame, [0, durationInFrames], [0, 100])
  const offset2 = interpolate(frame, [0, durationInFrames], [100, 0])

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND_COLORS.background }}>
      <div
        style={{
          position: 'absolute',
          width: '200%',
          height: '200%',
          top: '-50%',
          left: '-50%',
          background: `
            radial-gradient(circle at ${30 + offset1 * 0.2}% ${20 + offset2 * 0.3}%,
              rgba(59, 130, 246, 0.15) 0%, transparent 50%),
            radial-gradient(circle at ${70 - offset1 * 0.1}% ${60 + offset2 * 0.2}%,
              rgba(16, 185, 129, 0.1) 0%, transparent 50%),
            radial-gradient(circle at ${50 + offset2 * 0.15}% ${80 - offset1 * 0.1}%,
              rgba(59, 130, 246, 0.08) 0%, transparent 50%)
          `,
        }}
      />
    </AbsoluteFill>
  )
}
