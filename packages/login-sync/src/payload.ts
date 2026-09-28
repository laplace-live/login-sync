import { LoginSyncError } from './errors.js'

/**
 * One cookie as `browser.cookies.getAll()` reports it. Browser-specific extras such as `partitionKey` or Firefox's
 * `firstPartyDomain` are carried through untouched.
 */
export interface LoginSyncCookie {
  name: string
  value: string
  domain: string
  path: string
  secure: boolean
  httpOnly: boolean
  hostOnly: boolean
  session: boolean
  /** `no_restriction`, `lax`, `strict` or `unspecified` */
  sameSite: string
  storeId: string
  /** Seconds since the epoch; absent on session cookies */
  expirationDate?: number
}

/**
 * The plaintext inside every protocol version. The snake_case keys are part of the contract: the server's `/remove`
 * accepts a decrypted `cookie_data` as proof that the caller knows the password.
 */
export interface LoginSyncPayload {
  /** Cookies grouped by the domain the extension queried, e.g. `bilibili.com` */
  cookie_data: Record<string, LoginSyncCookie[]>
  /** localStorage mirrored per host, e.g. `laplace.live`. localStorage only holds strings */
  local_storage_data: Record<string, Record<string, string>>
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Deliberately shallow, like the rest of the pipeline: cookie fields differ across browsers and releases, and rejecting
// one we don't recognize would lock users out of blobs that decrypt fine
function isCookieData(value: unknown): value is LoginSyncPayload['cookie_data'] {
  return isRecord(value) && Object.values(value).every(cookies => Array.isArray(cookies) && cookies.every(isRecord))
}

// Unlike cookies, the values are checked: localStorage only holds strings, every writer has only ever sent strings, and
// readers are handed them typed as strings
function isStringMap(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(item => typeof item === 'string')
}

function isLocalStorageData(value: unknown): value is LoginSyncPayload['local_storage_data'] {
  return isRecord(value) && Object.values(value).every(isStringMap)
}

/**
 * Checks the shape of a payload and fills in `local_storage_data`, which blobs from older writers, such as the retired
 * Python client, may lack. Fields it doesn't know pass through.
 */
export function toPayload(value: unknown): LoginSyncPayload {
  if (!isRecord(value)) {
    throw new LoginSyncError('malformed', 'payload is not a JSON object')
  }
  const cookieData = value.cookie_data
  if (!isCookieData(cookieData)) {
    throw new LoginSyncError('malformed', 'payload has no `cookie_data` object of cookie arrays')
  }
  const localStorageData = value.local_storage_data ?? {}
  if (!isLocalStorageData(localStorageData)) {
    throw new LoginSyncError('malformed', '`local_storage_data` is not an object of string maps')
  }
  return { ...value, cookie_data: cookieData, local_storage_data: localStorageData }
}
