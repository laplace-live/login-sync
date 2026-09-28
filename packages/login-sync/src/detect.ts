import { LoginSyncError } from './errors.js'
import { V1_PREFIX } from './v1.js'
import { V2_PREFIX } from './v2.js'

// A `const` type parameter keeps the literals, so `ProtocolVersion` is derived from the list rather than restated, and
// a version added to the list fails every test that loops over it until encrypt and decrypt handle it
function versionList<const T extends readonly number[]>(versions: T): T {
  return versions
}

/** Every version this SDK reads and writes. */
export const SUPPORTED_VERSIONS = versionList([1, 2])

export type ProtocolVersion = (typeof SUPPORTED_VERSIONS)[number]

// Tags start at v2: v1 predates them and is recognized by its OpenSSL header alone. `:` is outside the base64 alphabet,
// so a tag can never be mistaken for the start of a v1 blob.
const VERSION_TAG = /^v([1-9][0-9]*):/

/**
 * Reads the protocol version from the blob's prefix; nothing is decrypted. A tag newer than this SDK throws
 * `unsupported_version`, so an outdated reader says "upgrade" rather than "wrong password".
 */
export function detectVersion(blob: string): ProtocolVersion {
  if (typeof blob !== 'string') {
    throw new LoginSyncError('malformed', 'blob must be a string')
  }
  if (blob.startsWith(V1_PREFIX)) return 1
  if (blob.startsWith(V2_PREFIX)) return 2
  const tag = Number(VERSION_TAG.exec(blob)?.[1])
  if (tag > Math.max(...SUPPORTED_VERSIONS)) {
    throw new LoginSyncError(
      'unsupported_version',
      `blob uses protocol v${tag}, newer than this SDK; upgrade @laplace.live/login-sync`
    )
  }
  throw new LoginSyncError('malformed', 'not a login-sync blob')
}
