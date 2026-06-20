import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Env, Variables } from '../../src/types'
import { generateJWT } from '../../src/lib/auth'

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only'
const TEST_USER_ID = 'user-123'

// --- Mock setup ---

const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}
const chainMethods = ['select', 'insert', 'update', 'delete', 'eq', 'single', 'maybeSingle', 'is', 'order', 'in', 'limit']
for (const m of chainMethods) {
  mockChain[m] = vi.fn().mockReturnValue(mockChain)
}
const mockRpc = vi.fn()

vi.mock('../../src/lib/supabase', () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn().mockReturnValue(mockChain),
    rpc: mockRpc,
  }),
}))

vi.mock('../../src/lib/usage', () => ({
  checkUsageLimit: vi.fn(),
  recalculateStorageUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../src/lib/openai', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2], [0.3, 0.4]]),
}))

const { mockInvalidateBatch } = vi.hoisted(() => ({
  mockInvalidateBatch: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../src/lib/embedding-cache', () => ({
  invalidateEmbeddingCache: vi.fn().mockResolvedValue(true),
  invalidateEmbeddingCacheBatch: mockInvalidateBatch,
}))

vi.mock('../../src/lib/document-parser', () => ({
  parseDocument: vi.fn().mockResolvedValue({
    text: 'parsed document text content',
    pageCount: 1,
    wordCount: 5,
  }),
  chunkText: vi.fn().mockReturnValue([
    { content: 'chunk1 content', chunkIndex: 0 },
    { content: 'chunk2 content', chunkIndex: 1 },
  ]),
  estimateTokens: vi.fn().mockReturnValue(100),
}))

import documentsRoutes from '../../src/routes/documents'
import { checkUsageLimit, recalculateStorageUsage } from '../../src/lib/usage'

const TEST_ENV = {
  JWT_SECRET: TEST_JWT_SECRET,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  OPENAI_API_KEY: 'test-openai-key',
} as Env

async function createAuthHeaders(): Promise<Record<string, string>> {
  const token = await generateJWT(
    { sub: TEST_USER_ID },
    TEST_JWT_SECRET
  )
  return { Authorization: `Bearer ${token}` }
}

function createApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.route('/api/documents', documentsRoutes)
  return app
}

function resetMocks() {
  vi.clearAllMocks()
  for (const m of chainMethods) {
    mockChain[m] = vi.fn().mockReturnValue(mockChain)
  }
}

// --- Tests ---

describe('GET /api/documents', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/documents', {}, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns documents list', async () => {
    const docs = [
      {
        id: 'doc-1',
        name: 'resume.pdf',
        type: 'resume',
        status: 'ready',
        chunk_count: 3,
        word_count: 500,
        uploaded_at: '2026-01-01T00:00:00Z',
      },
    ]

    mockChain.order = vi.fn().mockResolvedValue({ data: docs, error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents', { headers }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].id).toBe('doc-1')
    expect(body.documents[0].chunkCount).toBe(3)
    expect(body.documents[0].wordCount).toBe(500)
  })

  it('returns 500 on database error', async () => {
    mockChain.order = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents', { headers }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })
})

describe('DELETE /api/documents/:id', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/documents/some-id', { method: 'DELETE' }, TEST_ENV)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid UUID', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/not-a-uuid', {
      method: 'DELETE',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid document ID')
  })

  it('returns 404 for non-existent document', async () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'
    mockChain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'not found' },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(`/api/documents/${validUUID}`, {
      method: 'DELETE',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(404)
  })

  it('returns 403 when document belongs to different user', async () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'
    mockChain.single = vi.fn().mockResolvedValue({
      data: { id: validUUID, user_id: 'other-user' },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(`/api/documents/${validUUID}`, {
      method: 'DELETE',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(403)
  })

  it('returns 500 when delete operation fails', async () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'
    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: { id: validUUID, user_id: TEST_USER_ID },
      error: null,
    })

    // delete chain returns error
    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    let eqCount = 0
    mockChain.eq = vi.fn().mockImplementation(() => {
      eqCount++
      // chunks delete resolves ok, documents delete returns error
      if (eqCount === 4) return Promise.resolve({})
      if (eqCount === 6) return Promise.resolve({ error: { message: 'delete failed' } })
      return mockChain
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(`/api/documents/${validUUID}`, {
      method: 'DELETE',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(500)
  })
})

describe('POST /api/documents/search', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test' }),
    }, TEST_ENV)

    expect(res.status).toBe(401)
  })

  it('returns 400 for missing query', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Query is required')
  })

  it('returns 400 for empty query', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('empty')
  })

  it('returns 400 for query exceeding max length', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'a'.repeat(1001) }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('1000')
  })

  it('returns 400 for invalid topK', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()

    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', topK: 0 }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('topK')
  })

  it('returns 400 for invalid minSimilarity', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()

    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', minSimilarity: 1.5 }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('minSimilarity')
  })

  it('returns 400 for invalid documentTypes', async () => {
    const app = createApp()
    const headers = await createAuthHeaders()

    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test', documentTypes: ['invalid_type'] }),
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('documentTypes')
  })

  it('returns 429 when AI token limit exceeded', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: false,
      used: 30000,
      limit: 30000,
      remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    }, TEST_ENV)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns empty results when no matches found', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 100,
      limit: 30000,
      remaining: 29900,
    })

    mockRpc.mockResolvedValue({ data: [], error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.results).toEqual([])
  })

  it('returns 500 on search RPC error', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 100,
      limit: 30000,
      remaining: 29900,
    })

    mockRpc.mockResolvedValue({ data: null, error: { message: 'search failed' } })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    }, TEST_ENV)

    expect(res.status).toBe(500)
  })

  it('returns grouped results on successful search', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 100,
      limit: 30000,
      remaining: 29900,
    })

    const matches = [
      { id: 'chunk-1', document_id: 'doc-1', document_name: 'resume.pdf', document_type: 'resume', content: 'matched content 1', similarity: 0.95 },
      { id: 'chunk-2', document_id: 'doc-1', document_name: 'resume.pdf', document_type: 'resume', content: 'matched content 2', similarity: 0.85 },
    ]

    mockRpc.mockResolvedValue({ data: matches, error: null })

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request('/api/documents/search', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'test query' }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.results).toHaveLength(1)
    expect(body.results[0].documentId).toBe('doc-1')
    expect(body.results[0].documentName).toBe('resume.pdf')
    expect(body.results[0].chunks).toHaveLength(2)
  })
})

describe('POST /api/documents (upload)', () => {
  beforeEach(resetMocks)

  it('returns 401 without auth', async () => {
    const app = createApp()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['test'], 'test.txt'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(401)
  })

  it('returns 429 when document limit exceeded (no existing doc)', async () => {
    // maybeSingle: 既存ドキュメントなし → usage check へ進む
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: false,
      used: 3,
      limit: 3,
      remaining: 0,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['test content'], 'test.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('returns 400 for invalid document type', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 3,
      remaining: 3,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'invalid_type')
    formData.append('file', new File(['test'], 'test.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid document type')
  })

  it('replaces existing document with same name and type (upsert)', async () => {
    const existingDocId = '550e8400-e29b-41d4-a716-446655440000'

    // maybeSingle: 既存ドキュメントが見つかる → usage check スキップ、旧ドキュメント削除へ
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: existingDocId }, error: null })

    // deleteDocumentWithChunks + insertDocumentAndChunks の全 chain を成功モックに
    // eq: delete chain の最終 resolve は { error: null } を返す必要がある
    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.insert = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.is = vi.fn().mockReturnValue(mockChain)
    // eq は chain を返しつつ、delete の完了時は { error: null } を resolve
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    // single: insert の結果（新ドキュメント）
    mockChain.single = vi.fn().mockResolvedValue({
      data: { id: 'new-doc-id', name: 'resume.pdf', type: 'resume', uploaded_at: '2026-03-26T00:00:00Z' },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['new content'], 'resume.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    // 旧ドキュメントの削除が実行されたことを確認
    expect(mockChain.delete).toHaveBeenCalled()
  })

  it('returns 500 when old document deletion fails during upsert', async () => {
    const existingDocId = '550e8400-e29b-41d4-a716-446655440000'

    // maybeSingle: 既存ドキュメントが見つかる
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: existingDocId }, error: null })

    // deleteDocumentWithChunks 内の流れ:
    // 1. select('content') → チャンク取得
    // 2. delete().eq().eq() → チャンク削除（ここでエラー）
    mockChain.select = vi.fn().mockReturnValue(mockChain)
    mockChain.is = vi.fn().mockReturnValue(mockChain)

    // eq チェーン: delete後の2番目のeqで resolve → エラーを返す
    const eqResults: Array<Record<string, unknown> | typeof mockChain> = []
    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockImplementation(() => {
      eqResults.push(mockChain)
      // deleteDocumentWithChunks: select→eq→eq(resolve), delete→eq→eq(resolve)
      // 4番目のeq呼び出し = チャンク削除の完了
      if (eqResults.length === 4) {
        return Promise.resolve({ error: { message: 'chunk delete failed' } })
      }
      return mockChain
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['new content'], 'resume.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it('allows upsert even when at document limit', async () => {
    const existingDocId = '550e8400-e29b-41d4-a716-446655440000'

    // maybeSingle: 既存ドキュメントが見つかる → usage check をスキップ
    mockChain.maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: existingDocId }, error: null })
      .mockResolvedValue({
        data: { id: 'new-doc-id', name: 'resume.pdf', type: 'resume', uploaded_at: '2026-03-26T00:00:00Z' },
        error: null,
      })

    // usage check は呼ばれないはず（上書きなのでスキップ）
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: false,
      used: 3,
      limit: 3,
      remaining: 0,
    })

    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.is = vi.fn().mockReturnValue(mockChain)
    mockChain.insert = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.single = vi.fn().mockResolvedValue({
      data: { id: 'new-doc-id', name: 'resume.pdf', type: 'resume', uploaded_at: '2026-03-26T00:00:00Z' },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['updated content'], 'resume.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    // 上書きなので429ではなく200
    expect(res.status).toBe(200)
    expect(checkUsageLimit).not.toHaveBeenCalled()
  })

  it('returns 400 when no file uploaded', async () => {
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 3,
      remaining: 3,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('No file')
  })

  it('recalculates storage usage after successful upload', async () => {
    // maybeSingle: 新規ドキュメント（既存なし）
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 50,
      remaining: 50,
    })

    mockChain.insert = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.single = vi.fn().mockResolvedValue({
      data: { id: 'new-doc-id', name: 'test.pdf', type: 'resume', uploaded_at: '2026-03-28T00:00:00Z' },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['test file content'], 'test.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    // recalculateStorageUsage がアップロード後に呼ばれること
    expect(recalculateStorageUsage).toHaveBeenCalledWith(
      expect.anything(), // supabase client
      TEST_USER_ID,
    )
  })

  it('does not recalculate storage when upload fails', async () => {
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 50,
      remaining: 50,
    })

    // insert が失敗
    mockChain.insert = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'insert failed' },
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['content'], 'test.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    expect(res.status).toBe(500)
    expect(recalculateStorageUsage).not.toHaveBeenCalled()
  })

  it('succeeds even when recalculateStorageUsage fails', async () => {
    mockChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })

    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 50,
      remaining: 50,
    })
    vi.mocked(recalculateStorageUsage).mockRejectedValueOnce(new Error('storage calc failed'))

    mockChain.insert = vi.fn().mockReturnValue(mockChain)
    mockChain.update = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)
    mockChain.single = vi.fn().mockResolvedValue({
      data: { id: 'new-doc-id', name: 'test.pdf', type: 'resume', uploaded_at: '2026-03-28T00:00:00Z' },
      error: null,
    })

    const app = createApp()
    const headers = await createAuthHeaders()
    const formData = new FormData()
    formData.append('type', 'resume')
    formData.append('file', new File(['content'], 'test.pdf'))

    const res = await app.request('/api/documents', {
      method: 'POST',
      headers,
      body: formData,
    }, TEST_ENV)

    // ストレージ計算が失敗してもアップロードは成功する
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

describe('Storage usage tracking on DELETE', () => {
  beforeEach(resetMocks)

  it('recalculates storage usage after successful deletion', async () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000'

    mockChain.single = vi.fn().mockResolvedValueOnce({
      data: { id: validUUID, user_id: TEST_USER_ID },
      error: null,
    })

    // deleteDocumentWithChunks: select chunks → delete chunks → delete doc
    mockChain.select = vi.fn().mockReturnValue(mockChain)
    mockChain.delete = vi.fn().mockReturnValue(mockChain)
    mockChain.is = vi.fn().mockReturnValue(mockChain)
    mockChain.eq = vi.fn().mockReturnValue(mockChain)

    const app = createApp()
    const headers = await createAuthHeaders()
    const res = await app.request(`/api/documents/${validUUID}`, {
      method: 'DELETE',
      headers,
    }, TEST_ENV)

    expect(res.status).toBe(200)
    // recalculateStorageUsage が削除後に呼ばれること
    expect(recalculateStorageUsage).toHaveBeenCalledWith(
      expect.anything(),
      TEST_USER_ID,
    )
  })
})
