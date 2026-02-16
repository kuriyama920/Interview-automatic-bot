/**
 * Remotion エントリーポイント
 *
 * Remotion Studio / SSR レンダリング用のルートコンポーネント
 */

import React from 'react'
import { Composition, registerRoot } from 'remotion'
import { FeatureHighlight } from '../src/video/templates/feature-highlight'
import { TipOfDay } from '../src/video/templates/tip-of-day'
import { DemoShowcase } from '../src/video/templates/demo-showcase'
import { StatsPromo } from '../src/video/templates/stats-promo'
import { Testimonial } from '../src/video/templates/testimonial'
import { VIDEO_CONFIG } from '../src/video/constants'
import type { VideoTemplateProps } from '../src/types'

const defaultProps: VideoTemplateProps = {
  headline: '面接、もう怖くない',
  subheadline: '言葉に詰まって落ちた経験、ありませんか？',
  bodyText: [
    'リアルタイム文字起こしで質問を正確に把握',
    'AIが最適な回答をその場で提案',
    'あなたの経験に基づいたパーソナライズ回答',
  ],
  ctaText: '無料で試してみる',
  templateType: 'feature-highlight',
  metadata: {},
}

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="feature-highlight"
        component={FeatureHighlight}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={defaultProps}
      />
      <Composition
        id="tip-of-day"
        component={TipOfDay}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={{ ...defaultProps, templateType: 'tip-of-day' }}
      />
      <Composition
        id="demo-showcase"
        component={DemoShowcase}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={{ ...defaultProps, templateType: 'demo-showcase' }}
      />
      <Composition
        id="stats-promo"
        component={StatsPromo}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={{ ...defaultProps, templateType: 'stats-promo' }}
      />
      <Composition
        id="testimonial"
        component={Testimonial}
        durationInFrames={VIDEO_CONFIG.durationInFrames}
        fps={VIDEO_CONFIG.fps}
        width={VIDEO_CONFIG.width}
        height={VIDEO_CONFIG.height}
        defaultProps={{ ...defaultProps, templateType: 'testimonial' }}
      />
    </>
  )
}

registerRoot(RemotionRoot)
