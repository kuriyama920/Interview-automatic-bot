import { describe, it, expect, vi } from 'vitest'
import {
  processOpenAIStream,
  mapOpenAIErrorToMessage,
  ERROR_MESSAGES,
  createSSEResponse,
} from '../../src/lib/ai-streaming'

describe('processOpenAIStream', () => {
  function createMockStream() {
    const written: Array<{ data: string }> = []
    return {
      writeSSE: vi.fn(async (event: { data: string }) => {
        written.push(event)
      }),
      written,
    }
  }

  function createAsyncIterable<T>(events: T[]) {
    return {
      [Symbol.asyncIterator]: () => {
        let idx = 0
        return {
          async next() {
            if (idx < events.length) {
              return { value: events[idx++], done: false as const }
            }
            return { value: undefined, done: true as const }
          },
        }
      },
    }
  }

  it('writes chunk events for output_text.delta', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      { type: 'response.output_text.delta', delta: 'hello' },
      {
        type: 'response.completed',
        response: { id: 'resp_1', usage: { total_tokens: 100 } },
      },
    ])
    const metrics = { turnId: 'turn-1', m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    const result = await processOpenAIStream(stream, openaiStream, metrics)

    expect(result.totalTokensUsed).toBe(100)
    expect(result.responseId).toBe('resp_1')

    const parsedEvents = stream.written.map((w) => JSON.parse(w.data))
    const chunks = parsedEvents.filter((e: Record<string, unknown>) => e.type === 'chunk')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].content).toBe('hello')
  })

  it('emits metrics event on first chunk only', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      { type: 'response.output_text.delta', delta: 'a' },
      { type: 'response.output_text.delta', delta: 'b' },
      {
        type: 'response.completed',
        response: { id: 'resp_2', usage: { total_tokens: 50 } },
      },
    ])
    const metrics = { turnId: 'turn-1', phase: 'speculative' as const, m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    await processOpenAIStream(stream, openaiStream, metrics)

    const parsedEvents = stream.written.map((w) => JSON.parse(w.data))
    const metricsEvents = parsedEvents.filter((e: Record<string, unknown>) => e.type === 'metrics')
    expect(metricsEvents).toHaveLength(1)
    expect(metricsEvents[0].data.turnId).toBe('turn-1')
  })

  it('skips empty delta content', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      { type: 'response.output_text.delta', delta: '' },
      { type: 'response.output_text.delta', delta: 'real' },
      {
        type: 'response.completed',
        response: { id: 'resp_3', usage: { total_tokens: 30 } },
      },
    ])
    const metrics = { turnId: 'turn-1', m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    await processOpenAIStream(stream, openaiStream, metrics)

    const parsedEvents = stream.written.map((w) => JSON.parse(w.data))
    const chunks = parsedEvents.filter((e: Record<string, unknown>) => e.type === 'chunk')
    expect(chunks).toHaveLength(1)
  })

  it('throws on response.failed event', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      {
        type: 'response.failed',
        response: { error: { message: 'Internal error' } },
      },
    ])
    const metrics = { turnId: 'turn-1', m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    await expect(processOpenAIStream(stream, openaiStream, metrics)).rejects.toThrow(
      'Internal error'
    )
  })

  it('throws generic message when response.failed has no error message', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      {
        type: 'response.failed',
        response: { error: {} },
      },
    ])
    const metrics = { turnId: 'turn-1', m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    await expect(processOpenAIStream(stream, openaiStream, metrics)).rejects.toThrow(
      'OpenAI response failed'
    )
  })

  it('returns zero tokens when response.completed has no usage', async () => {
    const stream = createMockStream()
    const openaiStream = createAsyncIterable([
      { type: 'response.output_text.delta', delta: 'text' },
      {
        type: 'response.completed',
        response: { id: 'resp_4', usage: null },
      },
    ])
    const metrics = { turnId: 'turn-1', m4: 1000, m5: 1001, m6: 1002, m6_timedOut: false, m7: 1003 }

    const result = await processOpenAIStream(stream, openaiStream, metrics)
    expect(result.totalTokensUsed).toBe(0)
  })
})

describe('mapOpenAIErrorToMessage', () => {
  it('returns rate limit message for 429 error', () => {
    const error = Object.assign(new Error('rate limited'), { status: 429 })
    expect(mapOpenAIErrorToMessage(error)).toBe(ERROR_MESSAGES.RATE_LIMIT)
  })

  it('returns auth error message for 401 error', () => {
    const error = Object.assign(new Error('unauthorized'), { status: 401 })
    expect(mapOpenAIErrorToMessage(error)).toBe(ERROR_MESSAGES.AUTH_ERROR)
  })

  it('returns timeout message for timeout errors', () => {
    const error = new Error('Connection timeout')
    expect(mapOpenAIErrorToMessage(error)).toBe(ERROR_MESSAGES.TIMEOUT)
  })

  it('returns generic message for unknown errors', () => {
    const error = new Error('something else')
    expect(mapOpenAIErrorToMessage(error)).toBe(ERROR_MESSAGES.GENERIC)
  })

  it('returns generic message for non-Error values', () => {
    expect(mapOpenAIErrorToMessage('string error')).toBe(ERROR_MESSAGES.GENERIC)
  })
})

describe('ERROR_MESSAGES', () => {
  it('has all required message keys', () => {
    expect(ERROR_MESSAGES.RATE_LIMIT).toBeDefined()
    expect(ERROR_MESSAGES.AUTH_ERROR).toBeDefined()
    expect(ERROR_MESSAGES.TIMEOUT).toBeDefined()
    expect(ERROR_MESSAGES.GENERIC).toBeDefined()
  })

  it('messages are Japanese strings', () => {
    // All error messages should be Japanese
    expect(ERROR_MESSAGES.RATE_LIMIT).toContain('混み合って')
    expect(ERROR_MESSAGES.AUTH_ERROR).toContain('認証エラー')
    expect(ERROR_MESSAGES.TIMEOUT).toContain('タイムアウト')
    expect(ERROR_MESSAGES.GENERIC).toContain('エラー')
  })
})

describe('createSSEResponse', () => {
  it('returns a Response with correct SSE headers', () => {
    const response = createSSEResponse(async () => {})

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform')
    expect(response.headers.get('X-Accel-Buffering')).toBe('no')
    expect(response.headers.get('Content-Encoding')).toBe('identity')
  })

  it('writes SSE-formatted data to the stream', async () => {
    const response = createSSEResponse(async (writer) => {
      await writer.writeSSE({ data: JSON.stringify({ type: 'chunk', content: 'hello' }) })
      await writer.writeSSE({ data: JSON.stringify({ type: 'done' }) })
    })

    const body = await response.text()
    const lines = body.split('\n\n').filter(Boolean)

    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe('data: ' + JSON.stringify({ type: 'chunk', content: 'hello' }))
    expect(lines[1]).toBe('data: ' + JSON.stringify({ type: 'done' }))
  })

  it('closes stream after handler completes', async () => {
    const response = createSSEResponse(async (writer) => {
      await writer.writeSSE({ data: 'test' })
    })

    // Reading the full body should resolve (stream is closed)
    const body = await response.text()
    expect(body).toContain('data: test')
  })

  it('closes stream even when handler throws', async () => {
    const response = createSSEResponse(async () => {
      throw new Error('handler error')
    })

    // Stream should still close gracefully
    const body = await response.text()
    expect(body).toBe('')
  })

  it('accepts an ExecutionContext and calls waitUntil', async () => {
    const waitUntilFn = vi.fn()
    const mockCtx = { waitUntil: waitUntilFn } as unknown as ExecutionContext

    const response = createSSEResponse(async (writer) => {
      await writer.writeSSE({ data: 'test' })
    }, mockCtx)

    // waitUntil should be called with the run promise
    expect(waitUntilFn).toHaveBeenCalledTimes(1)
    expect(waitUntilFn.mock.calls[0][0]).toBeInstanceOf(Promise)

    // Stream should still work
    const body = await response.text()
    expect(body).toContain('data: test')
  })

  it('provides SSEWriter compatible with processOpenAIStream', async () => {
    const response = createSSEResponse(async (writer) => {
      // SSEWriter interface: writeSSE({ data: string })
      // This is the same interface processOpenAIStream expects
      await writer.writeSSE({ data: JSON.stringify({ type: 'metrics', data: { turnId: 't1' } }) })
      await writer.writeSSE({ data: JSON.stringify({ type: 'chunk', content: 'answer' }) })
      await writer.writeSSE({ data: JSON.stringify({ type: 'done', tokensUsed: 100 }) })
    })

    const body = await response.text()
    const events = body.split('\n\n').filter(Boolean).map((line) => {
      const raw = line.replace('data: ', '')
      return JSON.parse(raw)
    })

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('metrics')
    expect(events[1].type).toBe('chunk')
    expect(events[1].content).toBe('answer')
    expect(events[2].type).toBe('done')
  })
})
