import { LoginSyncError } from './errors.js'

/** The two halves of a login-sync token. */
export interface Credentials {
  uuid: string
  password: string
}

// The server stores each blob as `<uuid>.json` and accepts only ASCII letters and digits, which doubles as its
// path-traversal guard. The uuid is a short-uuid token, not an RFC 4122 UUID.
export const UUID_PATTERN = /^[a-zA-Z0-9]+$/

/**
 * Splits a `uuid@password` token as the extension displays it. The uuid can't contain `@`, so the first `@` is the
 * separator and the password may contain more.
 */
export function parseToken(token: string): Credentials {
  const trimmed = typeof token === 'string' ? token.trim() : ''
  const at = trimmed.indexOf('@')
  const uuid = at === -1 ? '' : trimmed.slice(0, at)
  const password = at === -1 ? '' : trimmed.slice(at + 1)
  if (!UUID_PATTERN.test(uuid) || !password) {
    throw new LoginSyncError('invalid_token', 'expected a `uuid@password` token')
  }
  return { uuid, password }
}

export function formatToken({ uuid, password }: Credentials): string {
  return `${uuid}@${password}`
}

// Both halves feed the key derivation, where an empty one would still "work" and quietly produce a blob nobody with the
// real token can open
export function assertCredentials(credentials: Credentials): void {
  if (
    typeof credentials?.uuid !== 'string' ||
    typeof credentials.password !== 'string' ||
    !credentials.uuid ||
    !credentials.password
  ) {
    throw new LoginSyncError('invalid_token', 'uuid and password must be non-empty strings')
  }
}
