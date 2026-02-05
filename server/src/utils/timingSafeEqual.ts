import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'

/**
 * Performs a timing-safe comparison of two strings using crypto.timingSafeEqual
 * This prevents timing attacks where attackers can guess tokens by measuring response times
 *
 * @link https://developers.cloudflare.com/workers/examples/protect-against-timing-attacks/
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const aBuffer = Buffer.from(a)
  const bBuffer = Buffer.from(b)

  if (aBuffer.byteLength !== bBuffer.byteLength) {
    return false
  }

  return cryptoTimingSafeEqual(aBuffer, bBuffer)
}
