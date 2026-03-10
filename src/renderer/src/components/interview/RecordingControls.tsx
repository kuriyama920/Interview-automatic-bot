/**
 * 録音コントロール
 * 開始/停止/クリアボタン + ステータス表示
 */

import { useInterview } from '../../contexts/InterviewContext'
import { Spinner, WaveformVisualizer } from '../ui'
import { MicrophoneIcon } from '../ui/icons'

export function RecordingControls() {
  const {
    isConnected,
    isCapturing,
    isLoading,
    transcripts,
    handleStart,
    handleStop,
    handleClear,
  } = useInterview()

  return (
    <div className="px-5 py-3 border-b border-border/50 flex items-center justify-between">
      {/* ステータス表示 */}
      <div className="flex items-center gap-2">
        {isCapturing ? (
          <>
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
            </span>
            <span className="text-xs font-medium text-content-secondary">録音中</span>
            <WaveformVisualizer isActive={isCapturing} barCount={12} className="ml-1" />
          </>
        ) : transcripts.length > 0 ? (
          <>
            <span className="flex h-2.5 w-2.5">
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-success" />
            </span>
            <span className="text-xs font-medium text-content-secondary">完了</span>
          </>
        ) : (
          <span className="text-xs text-content-tertiary">録音を開始してください</span>
        )}
      </div>

      {/* 録音ボタン */}
      <div className="flex items-center gap-2">
        {!isConnected ? (
          <button
            onClick={handleStart}
            disabled={isLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-soft hover:shadow-card active:scale-[0.98]"
          >
            {isLoading ? <Spinner size="sm" /> : <MicrophoneIcon />}
            録音開始
          </button>
        ) : (
          <>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs text-content-secondary rounded-lg hover:bg-surface-hover border border-border/50 transition-colors"
            >
              クリア
            </button>
            <button
              onClick={handleStop}
              disabled={isLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-error text-white text-sm font-semibold rounded-xl hover:bg-error/90 disabled:opacity-50 transition-all shadow-soft active:scale-[0.98]"
            >
              録音停止
            </button>
          </>
        )}
      </div>
    </div>
  )
}
