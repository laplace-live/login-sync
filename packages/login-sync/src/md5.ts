// Web Crypto has no MD5, and v1 needs it for the passphrase and inside EVP_BytesToKey, so RFC 1321 by hand.

// RFC 1321's table: step i adds floor(2^32 · |sin(i + 1)|). Written out rather than computed, because ECMAScript leaves
// Math.sin's precision to the engine, and one constant off by one would silently corrupt every v1 key.
const T = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501, 0x698098d8,
  0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821, 0xf61e2562, 0xc040b340,
  0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8, 0x21e1cde6, 0xc33707d6, 0xf4d50d87,
  0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a, 0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c,
  0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70, 0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039,
  0xe6db99e5, 0x1fa27cf8, 0xc4ac5665, 0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92,
  0xffeff47d, 0x85845dd1, 0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb,
  0xeb86d391,
]

// Each round cycles its four rotation amounts across its 16 steps
const MD5_STEPS = [
  [7, 12, 17, 22],
  [5, 9, 14, 20],
  [4, 11, 16, 23],
  [6, 10, 15, 21],
]
  .flatMap(shifts => [...shifts, ...shifts, ...shifts, ...shifts])
  .map((shift, i) => ({ shift, t: T[i] ?? 0 }))

export function md5(data: Uint8Array): Uint8Array<ArrayBuffer> {
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
