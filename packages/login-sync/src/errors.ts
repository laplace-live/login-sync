export type LoginSyncErrorCode = 'invalid_token' | 'malformed' | 'unsupported_version' | 'bad_credentials'

/**
 * What the SDK throws for bad input. Branch on `code`:
 *
 * - `invalid_token`: the token or credentials are unusable, so no crypto ran
 * - `malformed`: not a login-sync blob, or its encoding or payload is broken
 * - `unsupported_version`: written in a protocol version newer than this SDK; upgrade the SDK
 * - `bad_credentials`: this uuid and password can't open the blob. A wrong token and a corrupted or tampered blob are
 *   indistinguishable by design
 */
export class LoginSyncError extends Error {
  override readonly name = 'LoginSyncError'
  readonly code: LoginSyncErrorCode

  constructor(code: LoginSyncErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}

export function isLoginSyncError(error: unknown, code?: LoginSyncErrorCode): error is LoginSyncError {
  return error instanceof LoginSyncError && (code === undefined || error.code === code)
}
