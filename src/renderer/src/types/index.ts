export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
  source?: 'mic' | 'system'
}

/** 会話履歴・Progressive AI 用の最小トランスクリプト型 */
export type Transcript = Pick<TranscriptResult, 'text' | 'source'>
