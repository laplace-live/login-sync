/**
 * Web Crypto stand-ins for the crypto-js calls the upload path was built on, byte-for-byte identical in output. The
 * server and `client-python/` decrypt with their own copies of the CryptoJS format, so any drift here surfaces as
 * garbage on their side rather than an error on ours; and the dedupe hash and cookie fingerprints are compared against
 * values that earlier builds stored.
 */

const utf8 = new TextEncoder()

/** Hex SHA-256 of `text` as UTF-8 — same as `CryptoJS.SHA256(text).toString()`. */
export async function sha256Hex(text: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text))))
}

/** Hex MD5 of `text` as UTF-8 — same as `CryptoJS.MD5(text).toString()`. */
export function md5Hex(text: string): string {
  return toHex(md5(utf8.encode(text)))
}

const OPENSSL_MAGIC = utf8.encode('Salted__')

/**
 * Same output as `CryptoJS.AES.encrypt(plainText, passphrase).toString()`: a random 8-byte salt, EVP_BytesToKey
 * (MD5, one iteration) for the key and IV, AES-256-CBC with PKCS#7 padding, and base64 of the OpenSSL envelope
 * `Salted__ ‖ salt ‖ ciphertext`.
 */
export async function encryptAes(plainText: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(8))
  const { key, iv } = evpBytesToKey(utf8.encode(passphrase), salt)
  const aesKey = await crypto.subtle.importKey('raw', key, 'AES-CBC', false, ['encrypt'])
  // Web Crypto always pads AES-CBC with PKCS#7, which is also CryptoJS's default
  const cipherText = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, aesKey, utf8.encode(plainText))
  return toBase64(concat(OPENSSL_MAGIC, salt, new Uint8Array(cipherText)))
}

// OpenSSL's EVP_BytesToKey: D_n = MD5(D_{n-1} ‖ passphrase ‖ salt), concatenated until there are enough bytes for the
// key and the IV, which for AES-256 is three rounds: 32 + 16 bytes.
function evpBytesToKey(passphrase: Uint8Array, salt: Uint8Array) {
  const seed = concat(passphrase, salt)
  const d1 = md5(seed)
  const d2 = md5(concat(d1, seed))
  const d3 = md5(concat(d2, seed))
  return { key: concat(d1, d2), iv: d3 }
}

// Web Crypto has no MD5, so RFC 1321 by hand. Each round cycles its four rotation amounts across 16 steps, and step
// i adds floor(2^32 · |sin(i + 1)|), derived through Math.sin just as CryptoJS derives it.
const MD5_STEPS = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
]
  .flatMap(shifts => [...shifts, ...shifts, ...shifts, ...shifts])
  .map((shift, i) => ({ shift, t: Math.floor(2 ** 32 * Math.abs(Math.sin(i + 1))) }))

function md5(data: Uint8Array): Uint8Array<ArrayBuffer> {
  // Append 0x80, zero-fill to 8 bytes short of a 64-byte boundary, then the bit length as a little-endian uint64
  const padded = new Uint8Array(((data.length + 72) >>> 6) << 6)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setBigUint64(padded.length - 8, BigInt(data.length) * 8n, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  for (let block = 0; block < padded.length; block += 64) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (const [i, { shift, t }] of MD5_STEPS.entries()) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) & 15
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) & 15
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) & 15
      }
      f = (f + a + t + view.getUint32(block + g * 4, true)) | 0
      a = d
      d = c
      c = b
      b = (b + ((f << shift) | (f >>> (32 - shift)))) | 0
    }
    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const digest = new Uint8Array(16)
  const out = new DataView(digest.buffer)
  out.setUint32(0, a0, true)
  out.setUint32(4, b0, true)
  out.setUint32(8, c0, true)
  out.setUint32(12, d0, true)
  return digest
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // `String.fromCharCode` takes a byte per argument; chunk so a multi-megabyte payload can't overflow the call stack
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
