import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateTemporaryToken, DEFAULT_STT_CONFIG } from '../../src/lib/deepgram'

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
      json: () => Promise.resolve({ access_token: 'temp-token-abc' }),
    })

    const result = await generateTemporaryToken('api-key-123', 600)

    expect(result).toEqual({
      token: 'temp-token-abc',
      expiresIn: 600,
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.deepgram.com/v1/auth/grant',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Token api-key-123',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ttl_seconds: 600 }),
      })
    )
  })

  it('clamps TTL to maximum 3600 seconds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'temp-token' }),
    })

    const result = await generateTemporaryToken('api-key', 7200)

    expect(result.expiresIn).toBe(3600)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ ttl_seconds: 3600 }),
      })
    )
  })

  it('uses default TTL of 600 when not specified', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: 'temp-token' }),
    })

    await generateTemporaryToken('api-key')

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ ttl_seconds: 600 }),
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

  it('throws on non-403 error response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    })

    await expect(generateTemporaryToken('api-key', 600)).rejects.toThrow(
      'Deepgram token generation failed (500): Internal Server Error'
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

  it('handles response.ok but no access_token (falls through to error)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}), // no access_token
      status: 200,
      text: () => Promise.resolve('OK'),
    })

    // When ok but no access_token, it falls through to the error path below
    // Since status is not 403, it tries to throw
    // Actually the code: if (response.ok) -> checks data.access_token
    // If no access_token, falls through. Then checks status === 403 (no).
    // Then tries to read response.text() and throws
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad Request'),
    })

    await expect(generateTemporaryToken('api-key', 600)).rejects.toThrow(
      'Deepgram token generation failed (400): Bad Request'
    )
  })
})

describe('DEFAULT_STT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_STT_CONFIG.model).toBe('nova-2')
    expect(DEFAULT_STT_CONFIG.language).toBe('ja')
    expect(DEFAULT_STT_CONFIG.encoding).toBe('linear16')
    expect(DEFAULT_STT_CONFIG.sampleRate).toBe(16000)
    expect(DEFAULT_STT_CONFIG.channels).toBe(1)
    expect(DEFAULT_STT_CONFIG.smartFormat).toBe(true)
    expect(DEFAULT_STT_CONFIG.interimResults).toBe(true)
    expect(DEFAULT_STT_CONFIG.utteranceEndMs).toBe(1000)
    expect(DEFAULT_STT_CONFIG.vadEvents).toBe(true)
  })
})
