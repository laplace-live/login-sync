import { describe, expect, test } from 'bun:test'

import type { LoginSyncPayload } from './index.js'

import vectors from '../vectors.json' with { type: 'json' }
import { fromBase64, toHex, utf8 } from './bytes.js'
import { decrypt, detectVersion, encrypt, LoginSyncError, SUPPORTED_VERSIONS } from './index.js'
import { decryptV1, encryptV1, v1Passphrase } from './v1.js'
import { encryptV2, V2_ITERATIONS } from './v2.js'

const fromHex = (text: string) => Uint8Array.from(text.match(/../g) ?? [], byte => Number.parseInt(byte, 16))

const credentials = { uuid: 'sQ4b8nKx2PzT7wYc9dLmRe', password: 'Hj3Vn8Qw2Zr5Tk9Bx4Mc7p' }
const payload = {
  cookie_data: {
    'bilibili.com': [
      {
        domain: '.bilibili.com',
        hostOnly: false,
        httpOnly: true,
        name: 'SESSDATA',
        path: '/',
        sameSite: 'unspecified',
        secure: true,
        session: false,
        storeId: '0',
        value: 'fake-session-value',
      },
    ],
  },
  local_storage_data: { 'laplace.live': { loginSyncOptionSendDanmaku: 'true' } },
} satisfies LoginSyncPayload

describe('v1: CryptoJS passphrase format', () => {
  test.each(vectors.v1.cipher)('decrypts crypto-js output: $name', async ({ passphrase, plaintext, blob }) => {
    expect(await decryptV1(blob, passphrase)).toBe(plaintext)
  })

  test.each([...vectors.v1.cipher, ...vectors.v1.payload])(
    'reproduces crypto-js output from its salt: $name',
    async ({ passphrase, plaintext, blob }) => {
      expect(await encryptV1(plaintext, passphrase, fromBase64(blob).slice(8, 16))).toBe(blob)
    }
  )

  test.each(vectors.v1.payload)('derives the passphrase and opens the payload: $name', async vector => {
    expect(v1Passphrase(vector)).toBe(vector.passphrase)
    const { version, payload } = await decrypt(vector.blob, vector)
    expect(version).toBe(1)
    expect(JSON.stringify(payload)).toBe(vector.plaintext)
  })
})

describe('v2: PBKDF2-SHA256 and AES-256-GCM', () => {
  test.each(vectors.v2)('derives the documented key: $name', async ({ uuid, password, key }) => {
    // Restated from PROTOCOL.md rather than imported, so the vectors check the spec and not just the code
    const material = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: utf8.encode(`laplace-login-sync/v2:${uuid}`), iterations: 100_000 },
      material,
      256
    )
    expect(toHex(new Uint8Array(bits))).toBe(key)
  })

  test.each(vectors.v2)('opens the blob: $name', async vector => {
    const { version, payload } = await decrypt(vector.blob, vector)
    expect(version).toBe(2)
    expect(JSON.stringify(payload)).toBe(vector.plaintext)
  })

  test.each(vectors.v2)('reproduces the blob from its nonce: $name', async vector => {
    expect(await encryptV2(vector.plaintext, vector, fromHex(vector.nonce))).toBe(vector.blob)
  })

  test('stays within the Cloudflare Workers PBKDF2 limit', () => {
    // Production Workers throws NotSupportedError above 100,000 iterations, and no local runtime reproduces it
    expect(V2_ITERATIONS).toBeLessThanOrEqual(100_000)
  })
})

describe('failures', () => {
  test.each(vectors.errors)('$name: $code', async vector => {
    const pending = decrypt(vector.blob, vector)
    await expect(pending).rejects.toBeInstanceOf(LoginSyncError)
    await expect(pending).rejects.toHaveProperty('code', vector.code)
  })

  test('a wrong password never yields a v1 payload', async () => {
    // v1 has no integrity check, so this leans on PKCS#7, strict UTF-8 and JSON parsing together
    const blob = await encrypt(payload, credentials, { version: 1 })
    for (let i = 0; i < 500; i++) {
      const pending = decrypt(blob, { ...credentials, password: `wrong-${i}` })
      await expect(pending).rejects.toHaveProperty('code', 'bad_credentials')
    }
  })

  test('empty credentials are rejected before any crypto runs', async () => {
    await expect(decrypt('v2:AAAA', { uuid: '', password: 'x' })).rejects.toHaveProperty('code', 'invalid_token')
  })
})

describe('encrypt', () => {
  test.each([...SUPPORTED_VERSIONS])('round-trips v%d with fresh randomness each time', async version => {
    const first = await encrypt(payload, credentials, { version })
    const second = await encrypt(payload, credentials, { version })
    expect(first).not.toBe(second)
    expect(detectVersion(first)).toBe(version)
    expect(await decrypt(first, credentials)).toEqual({ version, payload })
  })
})

describe('decrypt', () => {
  test('fills in local_storage_data for writers that omit it', async () => {
    const blob = await encryptV1(JSON.stringify({ cookie_data: {} }), v1Passphrase(credentials))
    expect((await decrypt(blob, credentials)).payload.local_storage_data).toEqual({})
  })

  test('passes through fields it does not know', async () => {
    const blob = await encryptV2(JSON.stringify({ ...payload, update_time: '2026-09-28' }), credentials)
    expect((await decrypt(blob, credentials)).payload).toHaveProperty('update_time', '2026-09-28')
  })
})
