import { describe, it, expect, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({ mocked: true }),
}))

import { createSupabaseAdmin } from '../../src/lib/supabase'
import { createClient } from '@supabase/supabase-js'
import type { Env } from '../../src/types'

describe('createSupabaseAdmin', () => {
  it('creates a Supabase client with env credentials', () => {
    const env = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    } as Env

    const result = createSupabaseAdmin(env)

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-role-key',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )
    expect(result).toEqual({ mocked: true })
  })
})
