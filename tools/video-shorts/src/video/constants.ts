/**
 * 動画用定数（ブラウザセーフ）
 *
 * Remotion バンドラー（webpack）で使うため、
 * Node.js モジュール（path, fs, dotenv等）に依存しないこと
 */

import type { BrandColors } from '../types'

/** ブランドカラー（既存デザインシステム準拠） */
export const BRAND_COLORS: BrandColors = {
  accent: '#3b82f6',
  accentHover: '#2563eb',
  background: '#ffffff',
  backgroundSecondary: '#f9fafb',
  text: '#111827',
  textSecondary: '#6b7280',
  success: '#10b981',
  error: '#ef4444',
} as const

/** 動画仕様 */
export const VIDEO_CONFIG = {
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 30,
  durationInFrames: 900,
} as const

/** ブランド情報 */
export const BRAND = {
  name: 'InterviewBot',
  tagline: 'AIリアルタイム面接支援',
  websiteUrl: 'https://interviewbot.app',
  downloadUrl: 'https://interviewbot.app/download',
  font: 'Noto Sans JP',
} as const
