/**
 * 資料管理ページ
 * 履歴書・求人票のアップロードと管理（全画面幅）
 */

import { useDocuments } from '../../hooks/useDocuments'
import { PageHeader } from '../ui/PageHeader'
import { Button, Spinner, Badge, ErrorAlert } from '../ui'
import { TrashIcon } from '../ui/icons'

const UploadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)

const DocumentIcon = () => (
  <svg className="w-5 h-5 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
)

interface DocumentSectionProps {
  title: string
  description: string
  type: DocType
  documents: DocumentInfo[]
  isUploading: boolean
  onUpload: (type: DocType) => Promise<void>
  onRemove: (id: string) => Promise<void>
}

function DocumentSection({ title, description, type, documents, isUploading, onUpload, onRemove }: DocumentSectionProps) {
  const filteredDocs = documents.filter((d) => d.type === type)

  return (
    <div className="bg-surface rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-content">{title}</h3>
          <p className="text-xs text-content-secondary mt-0.5">{description}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onUpload(type)}
          isLoading={isUploading}
          leftIcon={<UploadIcon />}
        >
          アップロード
        </Button>
      </div>

      {filteredDocs.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
          <DocumentIcon />
          <p className="text-sm text-content-tertiary mt-2">
            ファイルをアップロードしてください
          </p>
          <p className="text-xs text-content-tertiary mt-1">PDF / DOCX / TXT 対応</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <div
              key={doc.id}
              className="group flex items-center gap-3 p-3 rounded-lg bg-surface-secondary hover:bg-surface-tertiary transition-colors"
            >
              <DocumentIcon />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-content truncate">{doc.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="default" size="sm">{doc.chunkCount} チャンク</Badge>
                  <span className="text-[10px] text-content-tertiary">
                    {new Date(doc.uploadedAt).toLocaleDateString('ja-JP')}
                  </span>
                </div>
              </div>
              <button
                onClick={() => onRemove(doc.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-error-subtle text-content-tertiary hover:text-error transition-all"
                title="削除"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function DocumentsPage() {
  const { documents, isInitialized, isUploading, error, uploadDocument, removeDocument } = useDocuments()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="資料管理"
        subtitle="面接用の履歴書・求人票をアップロードして、AIのコンテキストとして活用"
      />

      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4">
            <ErrorAlert error={error} />
          </div>
        )}

        {!isInitialized ? (
          <div className="flex items-center justify-center py-20">
            <Spinner size="lg" className="text-accent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
            <DocumentSection
              title="履歴書・職務経歴書"
              description="あなたのスキルや経験をAIが参照します"
              type="resume"
              documents={documents}
              isUploading={isUploading}
              onUpload={uploadDocument}
              onRemove={removeDocument}
            />
            <DocumentSection
              title="求人票・募集要項"
              description="応募先の情報をAIが参照して回答を最適化"
              type="job_posting"
              documents={documents}
              isUploading={isUploading}
              onUpload={uploadDocument}
              onRemove={removeDocument}
            />
          </div>
        )}
      </div>
    </div>
  )
}
