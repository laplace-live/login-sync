// Copied from laplace-login-sync
import {
  type BinaryToTextEncoding,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto'
import { CryptoHasher, type DigestEncoding, type SupportedCryptoAlgorithms } from 'bun'

export function cryptoHash(
  input: Bun.BlobOrStringOrBuffer,
  {
    key,
    algorithm,
    encoding,
  }: {
    /** HMAC digests secret key */
    key?: string
    algorithm?: SupportedCryptoAlgorithms
    encoding?: DigestEncoding
  } = {}
) {
  const hasher = key ? new CryptoHasher(algorithm || 'sha256', key) : new CryptoHasher(algorithm || 'sha256')

  return hasher.update(input).digest(encoding || 'hex')
}

/** @deprecated, use `cryptoHash` instead */
export function cryptoHmac(
  input: string | NodeJS.ArrayBufferView,
  key: string,
  {
    algorithm,
    encoding,
  }: {
    algorithm?: SupportedCryptoAlgorithms
    encoding?: BinaryToTextEncoding
  } = {}
) {
  return createHmac(algorithm || 'sha256', key)
    .update(input)
    .digest(encoding || 'hex')
}

// https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
export async function hashEncode(inputString: string, algo?: string) {
  const algoStr = algo || 'SHA-256'
  const encoder = new TextEncoder()
  const data = encoder.encode(inputString)
  const hash = await crypto.subtle.digest(algoStr, data)
  return hash
}

export function hashToString(hashBuffer: ArrayBuffer) {
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/** Generate derive key from hash string */
export async function generateDeriveKey(keyStr: string) {
  const hashBuffer = await hashEncode(keyStr, 'SHA-256')

  // Since SHA-1 gives us 160 bits, and AES needs either 128, 192, or 256 bits, we need to adjust it
  // For simplicity, we can pad the SHA-1 hash to make it 256 bits (32 bytes)
  // Create a new array with 256 bits
  // let keyData = new Uint8Array(32)
  // Set the first 160 bits from the SHA-1 hash
  // keyData.set(new Uint8Array(hashBuffer))
  // The rest of the array remains zero, effectively padding the SHA-1 hash to 256 bits

  // Convert the SHA-1 hash to a format usable as a key
  const key = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-CBC' },
    false, // whether the key is extractable
    ['encrypt', 'decrypt'] // what this key can do
  )
  return key
}

// https://github.com/brix/crypto-js/issues/468
// https://github.com/brix/crypto-js/issues/468
// From https://gist.github.com/schakko/2628689?permalink_comment_id=3321113#gistcomment-3321113
// From https://gist.github.com/chengen/450129cb95c7159cb05001cc6bdbf6a1
export function encryptAes(plainText: string, secret: string) {
  const salt = randomBytes(8)
  const password = Buffer.concat([Buffer.from(secret, 'binary'), salt])
  const hash: Buffer[] = []
  let digest = password
  for (let i = 0; i < 3; i++) {
    const currentHash = createHash('md5').update(digest).digest()
    hash[i] = currentHash
    // hash[i] = new Bun.CryptoHasher('md5').update(digest).digest()
    digest = Buffer.concat([currentHash, password])
  }
  const keyDerivation = Buffer.concat(hash)
  const key = keyDerivation.subarray(0, 32)
  const iv = keyDerivation.subarray(32)
  const cipher = createCipheriv('aes-256-cbc', key, iv)

  const result = Buffer.concat([Buffer.from('Salted__', 'utf8'), salt, cipher.update(plainText), cipher.final()])

  return result.toString('base64')
}

export function decryptAes(encryptedText: string, secret: string) {
  const cypher = Buffer.from(encryptedText, 'base64')
  const salt = cypher.subarray(8, 16)
  const password = Buffer.concat([Buffer.from(secret, 'binary'), salt])
  const md5Hashes: Buffer[] = []
  let digest = password
  for (let i = 0; i < 3; i++) {
    const currentHash = createHash('md5').update(digest).digest()
    md5Hashes[i] = currentHash
    // md5Hashes[i] = new Bun.CryptoHasher('md5').update(digest).digest()
    digest = Buffer.concat([currentHash, password])
  }
  // After the loop, we know md5Hashes has exactly 3 elements
  const [hash0, hash1, hash2] = md5Hashes
  if (!hash0 || !hash1 || !hash2) {
    throw new Error('Failed to generate MD5 hashes')
  }
  const key = Buffer.concat([hash0, hash1])
  const iv = hash2
  const contents = cypher.subarray(16)
  const decipher = createDecipheriv('aes-256-cbc', key, iv)

  const result = Buffer.concat([decipher.update(contents), decipher.final()])

  return result.toString()
}
