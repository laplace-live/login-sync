/**
 * Protocol v2: the full password through PBKDF2-SHA256 into a master key, and HKDF from that into an AES-256-GCM key
 * and a key commitment, salted and authenticated with the uuid. Every parameter is fixed by the `v2:` tag and never read
 * from the blob, so a hostile blob can't pick a weak or ruinously slow key derivation.
 */

import type { Credentials } from './credentials.js'

import { concat, fromBase64, strictUtf8, toBase64, toHex, utf8 } from './bytes.js'
import { LoginSyncError } from './errors.js'

export const V2_PREFIX = 'v2:'

/**
 * Cloudflare Workers rejects PBKDF2 above 100,000 iterations in production, while wrangler dev and open-source workerd
 * don't enforce the cap, so a higher count would pass every local test and then break Worker readers. The generated
 * passwords carry 122 random bits; the stretching is defense in depth, not what keeps them safe.
 */
export const V2_ITERATIONS = 100_000

const COMMITMENT_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

/**
 * Writers pad the JSON to a multiple of this many bytes, because GCM ciphertext is exactly as long as its plaintext and
 * the server hands a blob to anyone who knows its uuid. Readers never depend on it, so it can change within v2.
 */
const PAD_BYTES = 1024

interface V2Keys {
  cipher: CryptoKey
  /** Stored ahead of the nonce, it pins a blob to the one key that wrote it */
  commitment: Uint8Array
}

// Key derivation is the one expensive step, about 10 ms, and its result is fixed per token while readers decrypt the
// same tokens over and over. Map order doubles as LRU order. Entries are keyed by a digest of the token, not the
// token: the cache also keeps every wrong guess, so a raw key would hold passwords, as large as callers send, in memory
const KEY_CACHE_LIMIT = 256
const keyCache = new Map<string, Promise<V2Keys>>()

async function deriveV2Keys({ uuid, password }: Credentials): Promise<V2Keys> {
  // Nothing is awaited between the lookup and the `set` below, so concurrent calls for one token share a derivation
  const digest = await crypto.subtle.digest('SHA-256', utf8.encode(JSON.stringify([uuid, password])))
  const id = toHex(new Uint8Array(digest))
  const cached = keyCache.get(id)
  if (cached) {
    keyCache.delete(id)
    keyCache.set(id, cached)
    return cached
  }
  const keys: Promise<V2Keys> = deriveKeys(uuid, password).catch((error: unknown) => {
    // Don't pin a failure, such as a runtime rejecting the iteration count, for the life of the process
    if (keyCache.get(id) === keys) keyCache.delete(id)
    throw error
  })
  keyCache.set(id, keys)
  for (const oldest of keyCache.keys()) {
    if (keyCache.size <= KEY_CACHE_LIMIT) break
    keyCache.delete(oldest)
  }
  return keys
}

async function deriveKeys(uuid: string, password: string): Promise<V2Keys> {
  const material = await crypto.subtle.importKey('raw', utf8.encode(password), 'PBKDF2', false, ['deriveBits'])
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: utf8.encode(`laplace-login-sync/v2:${uuid}`), iterations: V2_ITERATIONS },
    material,
    256
  )
  const hkdf = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveKey', 'deriveBits'])
  const [cipher, commitment] = await Promise.all([
    crypto.subtle.deriveKey(subkey('encrypt'), hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
    crypto.subtle.deriveBits(subkey('commit'), hkdf, COMMITMENT_BYTES * 8),
  ])
  return { cipher, commitment: new Uint8Array(commitment) }
}

// Each purpose gets its own label, so a new one adds a key without changing the blob. The salt can be empty because
// the master key is already uniformly random, which is what a salt would otherwise supply
function subkey(label: string): HkdfParams {
  return { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8.encode(`laplace-login-sync/v2/${label}`) }
}

// Binds the blob to its uuid, so it can't be replayed under another user's file
function aesGcm(uuid: string, nonce: Uint8Array<ArrayBuffer>): AesGcmParams {
  return { name: 'AES-GCM', iv: nonce, additionalData: utf8.encode(`${V2_PREFIX}${uuid}`), tagLength: TAG_BYTES * 8 }
}

/** Pads JSON with trailing spaces, which JSON allows after the value, so readers parse the padding away. */
export function padV2(json: string): string {
  const excess = utf8.encode(json).length % PAD_BYTES
  return excess === 0 ? json : json + ' '.repeat(PAD_BYTES - excess)
}

/** `nonce` is a parameter only so tests can reproduce known-answer vectors. Reusing one under the same key breaks GCM. */
export async function encryptV2(
  plaintext: string,
  credentials: Credentials,
  nonce: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
): Promise<string> {
  const { cipher, commitment } = await deriveV2Keys(credentials)
  const sealed = await crypto.subtle.encrypt(aesGcm(credentials.uuid, nonce), cipher, utf8.encode(plaintext))
  return V2_PREFIX + toBase64(concat(commitment, nonce, new Uint8Array(sealed)))
}

export async function decryptV2(blob: string, credentials: Credentials): Promise<string> {
  const data = fromBase64(blob.slice(V2_PREFIX.length))
  if (data.length < COMMITMENT_BYTES + NONCE_BYTES + TAG_BYTES) {
    throw new LoginSyncError('malformed', 'v2 blob is too short to hold a commitment, a nonce and a tag')
  }
  const { cipher, commitment } = await deriveV2Keys(credentials)
  // Checked before decrypting: GCM alone lets one crafted blob authenticate under many keys, and so test many password
  // guesses at once. The commitment sits in every blob, so it's no secret and a plain comparison leaks nothing
  if (!commitment.every((byte, i) => data[i] === byte)) {
    throw new LoginSyncError('bad_credentials', 'v2 blob does not open with this uuid and password')
  }
  const nonce = data.subarray(COMMITMENT_BYTES, COMMITMENT_BYTES + NONCE_BYTES)
  let plaintext: ArrayBuffer
  try {
    plaintext = await crypto.subtle.decrypt(
      aesGcm(credentials.uuid, nonce),
      cipher,
      data.subarray(COMMITMENT_BYTES + NONCE_BYTES)
    )
  } catch (cause) {
    // The commitment matched, so the key is right and the blob changed after it was written
    throw new LoginSyncError('bad_credentials', 'v2 blob was modified or damaged', { cause })
  }
  try {
    return strictUtf8.decode(plaintext)
  } catch (cause) {
    // The tag already proved the key, so bytes that aren't UTF-8 came from the writer
    throw new LoginSyncError('malformed', 'v2 plaintext is not UTF-8', { cause })
  }
}
