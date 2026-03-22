import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateTemporaryToken, DEFAULT_STT_CONFIG } from '../../src/lib/stt-token'

// Mock global fetch
const mockFetch = vi.fn()

describe('generateTemporaryToken', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns temporary token on successful API call', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ api_key: 'temp-soniox-key-abc', expires_at: '2026-03-23T01:00:00Z' }),
    })

    const result = await generateTemporaryToken('api-key-123', 600)

    expect(result).toEqual({
      token: 'temp-soniox-key-abc',
      expiresIn: 600,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.soniox.com/v1/auth/temporary-api-key',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer api-key-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expires_in_seconds: 600 }),
      })
    )
  })

  it('clamps TTL to maximum 3600 seconds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ api_key: 'temp-token' }),
    })

    const result = await generateTemporaryToken('api-key', 7200)

    expect(result.expiresIn).toBe(3600)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ expires_in_seconds: 3600 }),
      })
    )
  })

  it('uses default TTL of 600 when not specified', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ api_key: 'temp-token' }),
    })

    await generateTemporaryToken('api-key')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ expires_in_seconds: 600 }),
      })
    )
  })

  it('falls back to API key on 403 (insufficient permissions)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
    })

    const result = await generateTemporaryToken('my-api-key', 600)

    expect(result).toEqual({
      token: 'my-api-key',
      expiresIn: 600,
    })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('falls back to API key on 404', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
    })

    const result = await generateTemporaryToken('my-api-key', 600)

    expect(result).toEqual({
      token: 'my-api-key',
      expiresIn: 600,
    })
    consoleSpy.mockRestore()
  })

  it('throws on non-403/404 error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    await expect(generateTemporaryToken('api-key', 600)).rejects.toThrow(
      'Soniox token generation failed (500): Internal Server Error'
    )
  })

  it('falls back to API key on fetch TypeError (network error)', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockFetch.mockRejectedValue(new TypeError('fetch failed'))

    const result = await generateTemporaryToken('my-api-key', 600)

    expect(result).toEqual({
      token: 'my-api-key',
      expiresIn: 600,
    })
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('re-throws non-network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Something unexpected'))

    await expect(generateTemporaryToken('api-key', 600)).rejects.toThrow(
      'Something unexpected'
    )
  })
})

describe('DEFAULT_STT_CONFIG', () => {
  it('has correct Soniox default values', () => {
    expect(DEFAULT_STT_CONFIG.model).toBe('stt-rt-preview')
    expect(DEFAULT_STT_CONFIG.audioFormat).toBe('pcm_s16le')
    expect(DEFAULT_STT_CONFIG.sampleRate).toBe(16000)
    expect(DEFAULT_STT_CONFIG.numChannels).toBe(1)
    expect(DEFAULT_STT_CONFIG.languageHints).toEqual(['ja'])
    expect(DEFAULT_STT_CONFIG.enableEndpointDetection).toBe(true)
  })
})
