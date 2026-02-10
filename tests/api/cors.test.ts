/**
 * CORS ユーティリティのテスト
 */

import { describe, it, expect } from 'vitest'
import { setCorsHeaders, handlePreflight } from '../../apps/api/lib/cors'
import { createMockResponse } from './helpers'

describe('CORS Library', () => {
  describe('setCorsHeaders', () => {
    it('should allow requests without origin (Electron)', () => {
      const res = createMockResponse()
      const result = setCorsHeaders(res, undefined)
      expect(result).toBe(true)
    })

    it('should allow requests with null origin (Electron)', () => {
      const res = createMockResponse()
      const result = setCorsHeaders(res, 'null')
      expect(result).toBe(true)
    })

    it('should allow requests from allowed origins', () => {
      const res = createMockResponse()
      const result = setCorsHeaders(res, 'http://localhost:5173')
      expect(result).toBe(true)
      expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', 'http://localhost:5173')
    })

    it('should reject requests from unknown origins', () => {
      const res = createMockResponse()
      const result = setCorsHeaders(res, 'https://malicious-site.com')
      expect(result).toBe(false)
    })

    it('should set common CORS headers', () => {
      const res = createMockResponse()
      setCorsHeaders(res, 'http://localhost:3000')
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, DELETE, OPTIONS'
      )
      expect(res.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Authorization, Content-Type'
      )
    })
  })

  describe('handlePreflight', () => {
    it('should respond with 200 for OPTIONS', () => {
      const res = createMockResponse()
      handlePreflight(res, 'http://localhost:3000')
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.end).toHaveBeenCalled()
    })
  })
})
