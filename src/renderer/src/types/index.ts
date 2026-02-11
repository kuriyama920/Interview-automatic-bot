export interface TranscriptResult {
  text: string
  isFinal: boolean
  confidence: number
  timestamp: number
  source?: 'mic' | 'system'
}
