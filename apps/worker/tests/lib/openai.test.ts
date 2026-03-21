import { describe, it, expect, vi, beforeEach } from 'vitest'

// OpenAIクラスをモック（vi.hoistedでhoisting問題を回避）
const { MockOpenAI } = vi.hoisted(() => ({
  MockOpenAI: vi.fn(),
}))
vi.mock('openai', () => ({
  default: MockOpenAI,
}))

import { createOpenAIClient, generateEmbedding, generateEmbeddings } from '../../src/lib/openai'

// APIErrorのモック用ファクトリ
function makeAPIError(status: number, message = 'api error') {
  const err = new Error(message) as Error & { status: number }
  err.status = status
  Object.setPrototypeOf(err, MockOpenAI.APIError?.prototype ?? Error.prototype)
  return err
}

describe('createOpenAIClient', () => {
  beforeEach(() => {
    MockOpenAI.mockClear()
  })

  it('env未設定時はbaseURL=undefinedでOpenAIクライアントを作成する', () => {
    createOpenAIClient('sk-test-key')

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('envがundefinedの場合もbaseURL=undefinedでクライアントを作成する', () => {
    createOpenAIClient('sk-test-key', undefined)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('CF_ACCOUNT_IDとCF_AI_GATEWAY_ID両方ある場合はgateway URLを使用する', () => {
    // Cloudflare Account IDの実際の形式: 32桁の16進数
    const env = {
      CF_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890',
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: 'https://gateway.ai.cloudflare.com/v1/abcdef1234567890abcdef1234567890/interview-bot-gw/openai',
    })
  })

  it('CF_ACCOUNT_IDのみある場合（CF_AI_GATEWAY_IDなし）はデフォルトURLを使用する', () => {
    const env = {
      CF_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('CF_AI_GATEWAY_IDのみある場合（CF_ACCOUNT_IDなし）はデフォルトURLを使用する', () => {
    const env = {
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('apiKeyが正しく設定される', () => {
    const testKey = 'sk-my-special-api-key-12345'

    createOpenAIClient(testKey)

    expect(MockOpenAI).toHaveBeenCalledTimes(1)
    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.apiKey).toBe(testKey)
  })

  it('timeoutパラメータが指定された場合はtimeoutが設定される', () => {
    createOpenAIClient('sk-test-key', undefined, 5000)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
      timeout: 5000,
    })
  })

  it('timeout=0の場合もtimeoutが設定される', () => {
    createOpenAIClient('sk-test-key', undefined, 0)

    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.timeout).toBe(0)
  })

  it('timeoutが未指定の場合はtimeoutプロパティが含まれない', () => {
    createOpenAIClient('sk-test-key')

    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.timeout).toBeUndefined()
  })

  it('OpenAIインスタンスを返す', () => {
    const mockInstance = { embeddings: {} }
    MockOpenAI.mockReturnValue(mockInstance)

    const client = createOpenAIClient('sk-test-key')

    expect(client).toBe(mockInstance)
  })

  it('空文字のCF_ACCOUNT_IDとCF_AI_GATEWAY_IDはgateway URLを使用しない', () => {
    const env = {
      CF_ACCOUNT_ID: '',
      CF_AI_GATEWAY_ID: '',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('不正な形式のCF_ACCOUNT_ID（32桁hex以外）はgateway URLを使用しない（SSRFリスク軽減）', () => {
    const env = {
      CF_ACCOUNT_ID: 'invalid-account-id',
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })

  it('パストラバーサル文字を含むCF_ACCOUNT_IDはgateway URLを使用しない', () => {
    const env = {
      CF_ACCOUNT_ID: '../../attacker.com/abcdef12345678',
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    createOpenAIClient('sk-test-key', env)

    expect(MockOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      baseURL: undefined,
    })
  })
})

describe('generateEmbedding', () => {
  const mockEmbedding = [0.1, 0.2, 0.3]
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCreate = vi.fn().mockResolvedValue({
      data: [{ embedding: mockEmbedding }],
    })
    MockOpenAI.mockClear()
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: mockCreate },
    }))
  })

  it('テキストのembeddingを正常に生成する', async () => {
    const result = await generateEmbedding('テスト質問', 'sk-test-key')

    expect(result).toEqual(mockEmbedding)
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: 'テスト質問',
    })
  })

  it('envを指定するとAI Gateway経由でクライアントを作成する', async () => {
    const env = {
      CF_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890',
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    await generateEmbedding('テスト質問', 'sk-test-key', env)

    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.baseURL).toBe(
      'https://gateway.ai.cloudflare.com/v1/abcdef1234567890abcdef1234567890/interview-bot-gw/openai'
    )
  })

  it('envなしで呼び出すと直接OpenAI接続になる', async () => {
    await generateEmbedding('テスト質問', 'sk-test-key')

    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.baseURL).toBeUndefined()
  })

  it('429エラー時はレート制限メッセージをthrowする', async () => {
    // mapOpenAIErrorToMessage は instanceof Error + 'status' in error でチェック
    const apiError = Object.assign(new Error('rate limited'), { status: 429 })
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue(apiError) },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AIサービスが混み合っています'
    )
  })

  it('401エラー時は認証エラーメッセージをthrowする', async () => {
    const apiError = Object.assign(new Error('unauthorized'), { status: 401 })
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue(apiError) },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AIサービスの認証エラーが発生しました'
    )
  })

  it('500エラー時は汎用エラーメッセージをthrowする', async () => {
    const apiError = Object.assign(new Error('server error'), { status: 500 })
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue(apiError) },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AI処理中にエラーが発生しました'
    )
  })

  it('ネットワークエラー(ENOTFOUND)時は汎用エラーメッセージをthrowする', async () => {
    const networkError = new Error('ENOTFOUND api.openai.com')
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue(networkError) },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AI処理中にエラーが発生しました'
    )
  })

  it('一般的なErrorは汎用メッセージをthrowする', async () => {
    const genericError = new Error('some unexpected error')
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue(genericError) },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AI処理中にエラーが発生しました'
    )
  })

  it('非Errorのthrowは汎用メッセージをthrowする', async () => {
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: vi.fn().mockRejectedValue('string error') },
    }))

    await expect(generateEmbedding('テスト', 'sk-test-key')).rejects.toThrow(
      'AI処理中にエラーが発生しました'
    )
  })
})

describe('generateEmbeddings', () => {
  const mockEmbedding1 = [0.1, 0.2, 0.3]
  const mockEmbedding2 = [0.4, 0.5, 0.6]
  let mockCreate: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockCreate = vi.fn()
    MockOpenAI.mockClear()
    MockOpenAI.APIError = function(this: object) {} as unknown as typeof Error
    MockOpenAI.mockImplementation(() => ({
      embeddings: { create: mockCreate },
    }))
  })

  it('単一テキストのembeddingを生成する', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: mockEmbedding1 }] })

    const result = await generateEmbeddings(['テスト1'], 'sk-test-key')

    expect(result).toEqual([mockEmbedding1])
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('複数テキストのembeddingをバッチ生成する', async () => {
    mockCreate.mockResolvedValue({
      data: [{ embedding: mockEmbedding1 }, { embedding: mockEmbedding2 }],
    })

    const result = await generateEmbeddings(['テスト1', 'テスト2'], 'sk-test-key')

    expect(result).toEqual([mockEmbedding1, mockEmbedding2])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['テスト1', 'テスト2'],
    })
  })

  it('BATCH_SIZE(20)超過時は複数バッチに分割して処理する', async () => {
    // 21テキストの場合 20 + 1 に分割
    const texts = Array.from({ length: 21 }, (_, i) => `テキスト${i}`)
    const embeddings20 = Array.from({ length: 20 }, (_, i) => [i * 0.1])
    const embeddings1 = [[2.0]]

    mockCreate
      .mockResolvedValueOnce({ data: embeddings20.map(e => ({ embedding: e })) })
      .mockResolvedValueOnce({ data: embeddings1.map(e => ({ embedding: e })) })

    const result = await generateEmbeddings(texts, 'sk-test-key')

    expect(result).toHaveLength(21)
    expect(mockCreate).toHaveBeenCalledTimes(2)
    // 第1バッチ: 20テキスト
    expect(mockCreate.mock.calls[0][0].input).toHaveLength(20)
    // 第2バッチ: 1テキスト
    expect(mockCreate.mock.calls[1][0].input).toHaveLength(1)
  }, 10000)

  it('envを指定するとAI Gateway経由でクライアントを作成する', async () => {
    mockCreate.mockResolvedValue({ data: [{ embedding: mockEmbedding1 }] })
    const env = {
      CF_ACCOUNT_ID: 'abcdef1234567890abcdef1234567890',
      CF_AI_GATEWAY_ID: 'interview-bot-gw',
    }

    await generateEmbeddings(['テスト'], 'sk-test-key', env)

    const callArgs = MockOpenAI.mock.calls[0][0]
    expect(callArgs.baseURL).toContain('gateway.ai.cloudflare.com')
  })

  it('APIエラー時はエラーをthrowする', async () => {
    const apiError = Object.assign(new Error('rate limited'), { status: 429 })
    mockCreate.mockRejectedValue(apiError)

    await expect(generateEmbeddings(['テスト'], 'sk-test-key')).rejects.toThrow(
      'AIサービスが混み合っています'
    )
  })
})
