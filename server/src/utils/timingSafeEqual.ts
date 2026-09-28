import { createHash, timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'

/**
 * Performs a timing-safe comparison of two strings using crypto.timingSafeEqual
 * This prevents timing attacks where attackers can guess tokens by measuring response times
 *
 * Both inputs are hashed to fixed-length SHA-256 digests first, so there is no early
 * return on a length mismatch that would leak the length of the secret
 *
 * @link https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest()
  const bHash = createHash('sha256').update(b).digest()

  return cryptoTimingSafeEqual(aHash, bHash)
}
