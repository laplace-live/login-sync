import { describe, expect, test } from 'bun:test'

import app from './'

describe('events', () => {
  test('should return the correct response', async () => {
    const req = new Request('http://localhost/')
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
  })
})
