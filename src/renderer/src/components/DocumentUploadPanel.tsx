import { useDocuments } from '../hooks/useDocuments'

type DocumentType = 'resume' | 'job_posting'

interface DocumentInfo {
  id: string
  name: string
  type: DocumentType
  uploadedAt: number
  chunkCount: number
}

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
    <div className="flex items-center justify-between p-2 bg-base-200 rounded-lg group">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{document.name}</p>
        <p className="text-xs text-base-content/50">
          {document.chunkCount} chunks | {formatDate(document.uploadedAt)}
        </p>
      </div>
      <button
        className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
        title="削除"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  )
}

function DocumentSection({
  title,
  type,
  documents,
  isUploading,
  onUpload,
  onRemove,
}: {
  title: string
  type: DocumentType
  documents: DocumentInfo[]
  isUploading: boolean
  onUpload: () => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{title}</span>
        <button
          className="btn btn-xs btn-outline btn-primary"
          onClick={onUpload}
          disabled={isUploading}
        >
          {isUploading ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              追加
            </>
          )}
        </button>
      </div>
      {documents.length === 0 ? (
        <p className="text-xs text-base-content/50 text-center py-2">
          {type === 'resume' ? '履歴書をアップロード' : '求人票をアップロード'}
        </p>
      ) : (
        <div className="space-y-1">
          {documents.map((doc) => (
            <DocumentItem key={doc.id} document={doc} onRemove={() => onRemove(doc.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentUploadPanel() {
  const { documents, isUploading, isInitialized, error, uploadDocument, removeDocument } =
    useDocuments()

  const resumeDocs = documents.filter((d) => d.type === 'resume')
  const jobDocs = documents.filter((d) => d.type === 'job_posting')

  if (!isInitialized) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body py-4">
          <div className="flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            <span className="text-sm text-base-content/70">初期化中...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card bg-base-100 shadow-xl">
      <div className="card-body py-4">
        <div className="flex items-center justify-between">
          <h2 className="card-title text-lg">コンテキスト設定</h2>
          <div className="badge badge-accent badge-outline badge-sm">Phase 3</div>
        </div>

        {error && (
          <div className="alert alert-error py-2 text-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <DocumentSection
          title="履歴書"
          type="resume"
          documents={resumeDocs}
          isUploading={isUploading}
          onUpload={() => uploadDocument('resume')}
          onRemove={removeDocument}
        />

        <div className="divider my-2"></div>

        <DocumentSection
          title="求人票"
          type="job_posting"
          documents={jobDocs}
          isUploading={isUploading}
          onUpload={() => uploadDocument('job_posting')}
          onRemove={removeDocument}
        />

        <div className="text-xs text-base-content/50 mt-2">
          PDF / DOCX 対応 (最大10MB)
        </div>
      </div>
    </div>
  )
}

export default DocumentUploadPanel
