/**
 * A second implementation of both versions on node:crypto, written from PROTOCOL.md alone and held to the same vectors.
 * It stops the Web Crypto code and the vectors from drifting together, and it's the template for porting the protocol
 * to another language.
 */

import { describe, expect, test } from 'bun:test'
import { createDecipheriv, createHash, hkdfSync, pbkdf2Sync } from 'node:crypto'

import vectors from '../vectors.json' with { type: 'json' }

const md5 = (...parts: Uint8Array[]) => createHash('md5').update(Buffer.concat(parts)).digest()

function openV1(blob: string, uuid: string, password: string): string {
  const passphrase = createHash('md5').update(`${uuid}-${password}`).digest('hex').slice(0, 16)
  const data = Buffer.from(blob, 'base64')
  const seed = Buffer.concat([Buffer.from(passphrase), data.subarray(8, 16)])
  const d1 = md5(seed)
  const d2 = md5(d1, seed)
  const decipher = createDecipheriv('aes-256-cbc', Buffer.concat([d1, d2]), md5(d2, seed))
  return Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]).toString('utf8')
}

function openV2(blob: string, uuid: string, password: string): string {
  const data = Buffer.from(blob.slice('v2:'.length), 'base64')
  const master = pbkdf2Sync(password, `laplace-login-sync/v2:${uuid}`, 100_000, 32, 'sha256')
  const subkey = (label: string) =>
    Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `laplace-login-sync/v2/${label}`, 32))
  if (!subkey('commit').equals(data.subarray(0, 32))) throw new Error('the commitment does not match')
  const decipher = createDecipheriv('aes-256-gcm', subkey('encrypt'), data.subarray(32, 44))
  decipher.setAAD(Buffer.from(`v2:${uuid}`))
  decipher.setAuthTag(data.subarray(-16))
  return Buffer.concat([decipher.update(data.subarray(44, -16)), decipher.final()]).toString('utf8')
}

describe('node:crypto reference implementation', () => {
  test.each(vectors.v1.payload)('opens v1: $name', ({ blob, uuid, password, plaintext }) => {
    expect(openV1(blob, uuid, password)).toBe(plaintext)
  })

  test.each(vectors.v2)('opens v2: $name', ({ blob, uuid, password, plaintext }) => {
    expect(openV2(blob, uuid, password)).toBe(plaintext)
  })

  test.each(vectors.errors.filter(vector => vector.code === 'bad_credentials' && vector.blob.startsWith('v2:')))(
    'rejects v2: $name',
    ({ blob, uuid, password }) => {
      expect(() => openV2(blob, uuid, password)).toThrow()
    }
  )
})
