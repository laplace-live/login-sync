import { describe, expect, test } from 'bun:test'

import { timingSafeEqual } from './timingSafeEqual'

describe('timingSafeEqual', () => {
  test('returns true for identical strings', () => {
    expect(timingSafeEqual('s3cret-key', 's3cret-key')).toBe(true)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  test('returns false for different strings of the same length', () => {
    expect(timingSafeEqual('s3cret-key', 's3cret-kez')).toBe(false)
  })

  // node:crypto's timingSafeEqual throws on unequal byte lengths; that must never surface as a 500
  test('returns false without throwing when lengths differ', () => {
    expect(timingSafeEqual('s3cret-key', 's3cret')).toBe(false)
    expect(timingSafeEqual('s3cret', 's3cret-key')).toBe(false)
    expect(timingSafeEqual('s3cret-key', '')).toBe(false)
    // same string length, different UTF-8 byte length
    expect(timingSafeEqual('é', 'e')).toBe(false)
    // same UTF-8 byte length, different string length
    expect(timingSafeEqual('é', 'ab')).toBe(false)
  })
})
