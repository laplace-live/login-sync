export type LoginSyncErrorCode =
  | 'invalid_token'
  | 'malformed'
  | 'unsupported_version'
  | 'bad_credentials'
  | 'not_found'
  | 'unauthorized'
  | 'network_error'
  | 'server_error'

/**
 * What the SDK throws. Branch on `code`:
 *
 * - `invalid_token`: the token or credentials are unusable, so no crypto ran
 * - `malformed`: not a login-sync blob, or its encoding or payload is broken
 * - `unsupported_version`: written in a protocol version newer than this SDK; upgrade the SDK
 * - `bad_credentials`: this uuid and password can't open the blob. A wrong token and a corrupted or tampered blob are
 *   indistinguishable by design
 * - `not_found`: the server has no blob for this uuid
 * - `unauthorized`: the server is in private mode and the client's `authKey` is missing or wrong
 * - `network_error`: no response arrived: the server is unreachable, or a browser blocked the request
 * - `server_error`: the server answered with an error, or with something other than the sync server's answer, such as a
 *   proxy's error page. `status` holds the HTTP status
 */
export class LoginSyncError extends Error {
  override readonly name = 'LoginSyncError'
  readonly code: LoginSyncErrorCode
  /** The HTTP status of a `server_error` */
  readonly status: number | undefined

  constructor(code: LoginSyncErrorCode, message: string, options?: ErrorOptions & { status?: number }) {
    super(message, options)
    this.code = code
    this.status = options?.status
  }
}

export function isLoginSyncError(error: unknown, code?: LoginSyncErrorCode): error is LoginSyncError {
  return error instanceof LoginSyncError && (code === undefined || error.code === code)
}
