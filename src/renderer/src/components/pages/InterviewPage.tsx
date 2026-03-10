/**
 * 面接モードページ
 * リアルタイムSTT + AI回答生成
 */

import { InterviewProvider } from '../../contexts/InterviewContext'
import { TranscriptPanel } from '../interview/TranscriptPanel'
import { AIResponsePanel } from '../interview/AIResponsePanel'
import { ErrorAlert } from '../ui'
import { useInterview } from '../../contexts/InterviewContext'

function InterviewContent() {
  const { error } = useInterview()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {error && (
        <div className="px-4 pt-2">
          <ErrorAlert error={error} />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <TranscriptPanel />
        <AIResponsePanel />
      </div>
    </div>
  )
}

export function InterviewPage() {
  return (
    <InterviewProvider>
      <InterviewContent />
    </InterviewProvider>
  )
}
