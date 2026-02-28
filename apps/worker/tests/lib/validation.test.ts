import { describe, it, expect } from 'vitest'
import { isValidUUID } from '../../src/lib/validation'

describe('isValidUUID', () => {
  it('accepts valid UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidUUID('6ba7b810-9dad-41d1-80b4-00c04fd430c8')).toBe(true)
    expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
  })

  it('accepts uppercase UUID v4', () => {
    expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidUUID('')).toBe(false)
  })

  it('rejects non-v4 UUID (wrong version digit)', () => {
    // version digit is 3, not 4
    expect(isValidUUID('550e8400-e29b-31d4-a716-446655440000')).toBe(false)
  })

  it('rejects non-v4 UUID (wrong variant digit)', () => {
    // variant digit is 'c' which is not in [89ab]...wait, c is not valid
    // Actually [89ab] - let's use '0' which is outside range
    expect(isValidUUID('550e8400-e29b-41d4-0716-446655440000')).toBe(false)
  })

  it('rejects random strings', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false)
    expect(isValidUUID('12345')).toBe(false)
    expect(isValidUUID('hello world')).toBe(false)
  })

  it('rejects UUID with wrong length', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000')).toBe(false)
    expect(isValidUUID('550e8400-e29b-41d4-a716-4466554400000')).toBe(false)
  })

  it('rejects UUID without hyphens', () => {
    expect(isValidUUID('550e8400e29b41d4a716446655440000')).toBe(false)
  })
})
