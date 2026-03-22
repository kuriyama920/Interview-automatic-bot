import { vi } from 'vitest'

/**
 * Supabase クライアントのモック生成
 * チェーンメソッド (.from().select().eq().single() etc.) をサポート
 */
export function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}

  const chainMethods = [
    'select', 'insert', 'update', 'upsert', 'delete',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
    'is', 'in', 'like', 'ilike',
    'single', 'maybeSingle',
    'order', 'limit', 'range',
    'not', 'or', 'filter',
  ]

  for (const method of chainMethods) {
    mockChain[method] = vi.fn().mockReturnValue(mockChain)
  }

  // Default return value for terminal operations
  mockChain['single'] = vi.fn().mockResolvedValue({ data: null, error: null })

  const fromMock = vi.fn().mockReturnValue(mockChain)
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })

  return {
    from: fromMock,
    rpc: rpcMock,
    _chain: mockChain,
    ...overrides,
  }
}

/**
 * テスト用の環境変数 Bindings
 */
export const TEST_ENV = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  JWT_SECRET: 'test-jwt-secret-key-for-testing-purposes-only',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-supabase-key',
  OPENAI_API_KEY: 'test-openai-key',
  STRIPE_SECRET_KEY: 'sk_test_fake',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_fake',
  CRON_SECRET: 'test-cron-secret',
  SONIOX_API_KEY: 'test-soniox-key',
} as const
