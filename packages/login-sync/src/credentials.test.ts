import { describe, expect, test } from 'bun:test'

import { formatToken, isLoginSyncError, parseToken } from './index.js'

describe('parseToken', () => {
  test('splits the token the extension displays', () => {
    expect(parseToken('sQ4b8nKx2PzT7wYc9dLmRe@Hj3Vn8Qw2Zr5Tk9Bx4Mc7p')).toEqual({
      uuid: 'sQ4b8nKx2PzT7wYc9dLmRe',
      password: 'Hj3Vn8Qw2Zr5Tk9Bx4Mc7p',
    })
  })

  test('ignores whitespace before the uuid', () => {
    expect(parseToken('  abc123@secret')).toEqual({ uuid: 'abc123', password: 'secret' })
  })

  test('keeps trailing whitespace in the password', () => {
    expect(parseToken('abc123@secret  ')).toEqual({ uuid: 'abc123', password: 'secret  ' })
  })

  test('keeps any later @ in the password', () => {
    expect(parseToken('abc123@p@ss')).toEqual({ uuid: 'abc123', password: 'p@ss' })
  })

  test.each(['', 'abc123', '@secret', 'abc123@', 'abc-123@secret', '../etc@secret'])('rejects %p', token => {
    let error: unknown
    try {
      parseToken(token)
    } catch (caught) {
      error = caught
    }
    expect(isLoginSyncError(error, 'invalid_token')).toBe(true)
  })

  test('formatToken reverses it', () => {
    expect(formatToken(parseToken('abc123@p@ss'))).toBe('abc123@p@ss')
  })
})
