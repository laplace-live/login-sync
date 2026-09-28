/**
 * SHA-256 for the upload dedupe hash and the cookie fingerprints in `sync-diff.ts`. Both are compared against values
 * earlier builds stored, so the output has to stay identical to `CryptoJS.SHA256(text).toString()`. Encrypting the
 * payload is `@laplace.live/login-sync`'s job.
 */

const utf8 = new TextEncoder()

/** Hex SHA-256 of `text` as UTF-8. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(text)))
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
}
