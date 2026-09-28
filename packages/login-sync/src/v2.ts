/**
 * Protocol v2: the full password through PBKDF2-SHA256 into an AES-256-GCM key, salted and authenticated with the uuid.
 * Every parameter is fixed by the `v2:` tag and never read from the blob, so a hostile blob can't pick a weak or
 * ruinously slow key derivation.
 */

import type { Credentials } from './credentials.js'

import { concat, fromBase64, strictUtf8, toBase64, utf8 } from './bytes.js'
import { LoginSyncError } from './errors.js'

export const V2_PREFIX = 'v2:'

/**
 * Cloudflare Workers rejects PBKDF2 above 100,000 iterations in production, while wrangler dev and open-source workerd
 * don't enforce the cap, so a higher count would pass every local test and then break Worker readers. The generated
 * passwords carry 122 random bits; the stretching is defense in depth, not what keeps them safe.
 */
export const V2_ITERATIONS = 100_000

const NONCE_BYTES = 12
const TAG_BYTES = 16

// Key derivation is the one expensive step, about 10 ms, and its result is fixed per token while readers decrypt the
// same tokens over and over. Map order doubles as LRU order.
const KEY_CACHE_LIMIT = 256
const keyCache = new Map<string, Promise<CryptoKey>>()

export function deriveV2Key({ uuid, password }: Credentials): Promise<CryptoKey> {
  const id = JSON.stringify([uuid, password])
  const cached = keyCache.get(id)
  if (cached) {
    keyCache.delete(id)
    keyCache.set(id, cached)
    return cached
  }
  const key: Promise<CryptoKey> = pbkdf2(uuid, password).catch((error: unknown) => {
    // Don't pin a failure, such as a runtime rejecting the iteration count, for the life of the process
    if (keyCache.get(id) === key) keyCache.delete(id)
    throw error
  })
  keyCache.set(id, key)
  for (const oldest of keyCache.keys()) {
    if (keyCache.size <= KEY_CACHE_LIMIT) break
    keyCache.delete(oldest)
  }
  return key
}

async function pbkdf2(uuid: string, password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: utf8.encode(`laplace-login-sync/v2:${uuid}`), iterations: V2_ITERATIONS },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Binds the blob to its uuid, so it can't be replayed under another user's file
function aesGcm(uuid: string, nonce: Uint8Array<ArrayBuffer>): AesGcmParams {
  return { name: 'AES-GCM', iv: nonce, additionalData: utf8.encode(`${V2_PREFIX}${uuid}`), tagLength: TAG_BYTES * 8 }
}

/** `nonce` is a parameter only so tests can reproduce known-answer vectors. Reusing one under the same key breaks GCM. */
export async function encryptV2(
  plaintext: string,
  credentials: Credentials,
  nonce: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
): Promise<string> {
  const key = await deriveV2Key(credentials)
  const sealed = await crypto.subtle.encrypt(aesGcm(credentials.uuid, nonce), key, utf8.encode(plaintext))
  return V2_PREFIX + toBase64(concat(nonce, new Uint8Array(sealed)))
}

export async function decryptV2(blob: string, credentials: Credentials): Promise<string> {
  const data = fromBase64(blob.slice(V2_PREFIX.length))
  if (data.length < NONCE_BYTES + TAG_BYTES) {
    throw new LoginSyncError('malformed', 'v2 blob is too short to hold a nonce and a tag')
  }
  const key = await deriveV2Key(credentials)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      aesGcm(credentials.uuid, data.subarray(0, NONCE_BYTES)),
      key,
      data.subarray(NONCE_BYTES)
    )
  } catch (cause) {
    throw new LoginSyncError('bad_credentials', 'v2 blob does not authenticate with this uuid and password', { cause })
  }
  try {
    return strictUtf8.decode(plaintext)
  } catch (cause) {
    // The tag already proved the key, so bytes that aren't UTF-8 came from the writer
    throw new LoginSyncError('malformed', 'v2 plaintext is not UTF-8', { cause })
  }
}
