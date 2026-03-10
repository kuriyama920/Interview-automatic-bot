/**
 * 音声ソース切り替え
 */

import { useInterview } from '../../contexts/InterviewContext'

const AUDIO_SOURCE_LABELS = {
  mic: 'マイク',
  system: 'システム音声',
  both: 'マイク＋システム音声',
} as const

export function AudioSourceToggle() {
  const { audioSource, setAudioSource, isCapturing } = useInterview()

  return (
    <div className="px-5 py-2.5 border-t border-border/30 flex items-center justify-between">
      <div className="flex items-center gap-2 text-content-tertiary">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <span className="text-[11px]">{AUDIO_SOURCE_LABELS[audioSource]}</span>
      </div>

      {!isCapturing && (
        <div className="flex items-center bg-surface-tertiary/50 rounded-lg p-0.5">
          {(['system', 'mic', 'both'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setAudioSource(value)}
              className={`px-3 py-1.5 text-[11px] rounded-md transition-all ${
                audioSource === value
                  ? 'bg-surface text-accent shadow-sm font-medium'
                  : 'text-content-tertiary hover:text-content-secondary'
              }`}
            >
              {value === 'system' ? 'システム' : value === 'mic' ? 'マイク' : '両方'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
