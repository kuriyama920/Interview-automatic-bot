/**
 * ドキュメントアップロードパネル
 * Linear Design + Apple Vibrancy スタイル
 */

import { useDocuments } from '../hooks/useDocuments'
import { Card, CardHeader, Button, Spinner, ErrorAlert } from './ui'

// DocType, DocumentInfo はenv.d.tsでグローバル宣言済み

// アイコンコンポーネント
const PlusIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
)

const CloseIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
)

const DocumentIcon = () => (
  <svg className="w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
)

const ResumeIcon = () => (
  <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
)

const JobIcon = () => (
  <svg className="w-5 h-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
)

// ドキュメントアイテム
function DocumentItem({
  document,
  onRemove,
}: {
  document: DocumentInfo
  onRemove: () => void
}) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex items-center gap-3 p-2.5 bg-surface-secondary rounded-lg group hover:bg-surface-hover transition-colors">
      <DocumentIcon />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-content truncate">{document.name}</p>
        <p className="text-xs text-content-tertiary">
          {document.chunkCount} チャンク • {formatDate(document.uploadedAt)}
        </p>
      </div>
      <button
        className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-error-subtle text-content-tertiary hover:text-error transition-all"
        onClick={onRemove}
        title="削除"
      >
        <CloseIcon />
      </button>
    </div>
  )
}

// ドキュメントセクション
function DocumentSection({
  title,
  type,
  icon,
  documents,
  isUploading,
  onUpload,
  onRemove,
}: {
  title: string
  type: DocType
  icon: React.ReactNode
  documents: DocumentInfo[]
  isUploading: boolean
  onUpload: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-content">{title}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={isUploading ? undefined : <PlusIcon />}
          onClick={onUpload}
          disabled={isUploading}
          isLoading={isUploading}
        >
          追加
        </Button>
      </div>

      {documents.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-xs text-content-tertiary">
            {type === 'resume' ? '履歴書をアップロード' : '求人票をアップロード'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentItem key={doc.id} document={doc} onRemove={() => onRemove(doc.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// メインコンポーネント
function DocumentUploadPanel() {
  const { documents, isUploading, isInitialized, error, uploadDocument, removeDocument } =
    useDocuments()

  const resumeDocs = documents.filter((d) => d.type === 'resume')
  const jobDocs = documents.filter((d) => d.type === 'job_posting')

  if (!isInitialized) {
    return (
      <Card variant="default" padding="md">
        <div className="flex items-center justify-center gap-3 py-4">
          <Spinner size="sm" className="text-accent" />
          <span className="text-sm text-content-secondary">初期化中...</span>
        </div>
      </Card>
    )
  }

  return (
    <Card variant="default" padding="none" className="h-full">
      <div className="p-4 border-b border-border">
        <CardHeader
          title="コンテキスト"
          subtitle="面接用資料"
          className="mb-0"
        />
      </div>

      <div className="p-4 space-y-4">
        {error && <ErrorAlert error={error} />}

        <DocumentSection
          title="履歴書"
          type="resume"
          icon={<ResumeIcon />}
          documents={resumeDocs}
          isUploading={isUploading}
          onUpload={() => uploadDocument('resume')}
          onRemove={removeDocument}
        />

        <hr className="border-border" />

        <DocumentSection
          title="求人票"
          type="job_posting"
          icon={<JobIcon />}
          documents={jobDocs}
          isUploading={isUploading}
          onUpload={() => uploadDocument('job_posting')}
          onRemove={removeDocument}
        />

        <p className="text-xs text-content-tertiary text-center pt-2">
          PDF / DOCX 対応（最大10MB）
        </p>
      </div>
    </Card>
  )
}

export default DocumentUploadPanel
