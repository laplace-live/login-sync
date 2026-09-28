/**
 * Protocol v1 is CookieCloud's format and what every extension build to date writes:
 * `CryptoJS.AES.encrypt(json, passphrase).toString()`, where the passphrase is the first 16 hex characters of
 * MD5(`uuid-password`). That truncation caps the key at 64 bits whatever the password, which is why v2 exists. v1 is
 * kept byte for byte so every blob already on the server stays readable.
 */

import type { Credentials } from './credentials.js'

import { concat, fromBase64, strictUtf8, toBase64, toHex, utf8 } from './bytes.js'
import { LoginSyncError } from './errors.js'
import { md5 } from './md5.js'

const OPENSSL_MAGIC = utf8.encode('Salted__')

/** base64 of `Salted__`: the first 10 characters of every v1 blob. The 11th already mixes in salt bits. */
export const V1_PREFIX = 'U2FsdGVkX1'

export function v1Passphrase({ uuid, password }: Credentials): string {
  return toHex(md5(utf8.encode(`${uuid}-${password}`))).slice(0, 16)
}

// OpenSSL's EVP_BytesToKey with MD5 and one iteration: D_n = MD5(D_{n-1} ‖ passphrase ‖ salt), concatenated until there
// are enough bytes for the AES-256 key and the IV, which takes three rounds: 32 + 16 bytes
async function deriveCipher(passphrase: string, salt: Uint8Array, usage: KeyUsage) {
  const seed = concat(utf8.encode(passphrase), salt)
  const d1 = md5(seed)
  const d2 = md5(concat(d1, seed))
  const iv = md5(concat(d2, seed))
  const key = await crypto.subtle.importKey('raw', concat(d1, d2), 'AES-CBC', false, [usage])
  return { key, iv }
}

/** `salt` is a parameter only so tests can reproduce known-answer vectors. */
export async function encryptV1(
  plaintext: string,
  passphrase: string,
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(8))
): Promise<string> {
  const { key, iv } = await deriveCipher(passphrase, salt, 'encrypt')
  // Web Crypto always pads AES-CBC with PKCS#7, which is also CryptoJS's default
  const cipherText = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, utf8.encode(plaintext))
  return toBase64(concat(OPENSSL_MAGIC, salt, new Uint8Array(cipherText)))
}

export async function decryptV1(blob: string, passphrase: string): Promise<string> {
  const data = fromBase64(blob)
  // The magic and salt fill one block, then at least one block of ciphertext
  if (data.length < 32 || data.length % 16 !== 0 || !OPENSSL_MAGIC.every((byte, i) => data[i] === byte)) {
    throw new LoginSyncError('malformed', 'v1 blob is not an OpenSSL salted AES-CBC envelope')
  }
  const { key, iv } = await deriveCipher(passphrase, data.subarray(8, 16), 'decrypt')
  try {
    // A wrong key fails the PKCS#7 check about 255 times in 256; the UTF-8 and JSON checks catch the rest
    return strictUtf8.decode(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, data.subarray(16)))
  } catch (cause) {
    throw new LoginSyncError('bad_credentials', 'v1 blob does not decrypt with this uuid and password', { cause })
  }
}
