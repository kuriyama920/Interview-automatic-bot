/**
 * クイックスタートカード
 * 面接開始CTA
 */

import { useNavigation } from '../../contexts/NavigationContext'
import { Button } from '../ui'
import { MicrophoneIcon } from '../ui/icons'

export function QuickStartCard() {
  const { navigateTo, isRecording } = useNavigation()

  return (
    <div className="bg-gradient-to-br from-accent/5 to-accent/10 rounded-xl border border-accent/20 p-6">
      <div className="flex items-center gap-4">
        <div className="flex-shrink-0 w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent">
          <MicrophoneIcon className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-content">
            {isRecording ? '録音中...' : '面接を開始'}
          </h3>
          <p className="text-xs text-content-secondary mt-0.5">
            {isRecording
              ? '面接モードで録音が進行中です'
              : 'リアルタイム音声認識とAI回答支援を開始'}
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => navigateTo('interview')}
        >
          {isRecording ? '面接に戻る' : '開始する'}
        </Button>
      </div>
    </div>
  )
}
