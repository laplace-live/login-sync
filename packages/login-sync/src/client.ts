import type { Credentials } from './credentials.js'
import type { LoginSyncPayload } from './payload.js'
import type { DecryptResult, EncryptOptions } from './protocol.js'

import { assertCredentials, UUID_PATTERN } from './credentials.js'
import { LoginSyncError } from './errors.js'
import { isRecord } from './payload.js'
import { decrypt, encrypt } from './protocol.js'

export interface LoginSyncClientOptions {
  /** The sync server, optionally with a path prefix. Defaults to `https://login-sync.laplace.cn` */
  baseURL?: string
  /** The key a server in private mode requires for reads: its `LAPLACE_LOGIN_SYNC_AUTH_KEY` */
  authKey?: string
  /** Sent with every request, e.g. a token for a firewall in front of the server */
  headers?: HeadersInit
  /**
   * Replaces the global `fetch`, e.g. to cache responses or to call a Cloudflare service binding. It's called without a
   * `this`, so pass a bound method or an arrow function
   */
  fetch?: (url: string, init: RequestInit) => Promise<Response>
}

export interface RequestOptions {
  /** Cancels the request, e.g. `AbortSignal.timeout(10_000)`. An abort rejects with the signal's reason */
  signal?: AbortSignal
}

const DEFAULT_BASE_URL = 'https://login-sync.laplace.cn'

interface Outgoing {
  method: 'GET' | 'POST'
  headers?: Record<string, string>
  body?: BodyInit
}

interface Reply {
  status: number
  /** The parsed JSON body, or `undefined` for one that isn't JSON, such as a proxy's error page */
  body: unknown
}

/** Talks to a sync server. Payloads are encrypted and decrypted locally, so `pull` and `push` never send the password. */
export class LoginSyncClient {
  readonly baseURL: string
  readonly #authKey: string | undefined
  readonly #headers: HeadersInit | undefined
  readonly #fetch: LoginSyncClientOptions['fetch']

  constructor(options: LoginSyncClientOptions = {}) {
    // `new URL` rejects anything but an absolute URL, so a typo fails here rather than as a network error later
    this.baseURL = new URL(options.baseURL ?? DEFAULT_BASE_URL).href.replace(/\/+$/, '')
    this.#authKey = options.authKey
    this.#headers = options.headers
    this.#fetch = options.fetch
  }

  /** Downloads the blob stored under these credentials and decrypts it. */
  async pull(credentials: Credentials, options?: RequestOptions): Promise<DecryptResult> {
    assertRoutable(credentials)
    // A key rides in the body because a query string ends up in access logs and cache keys. Without one, a GET keeps
    // the read cacheable and spares browsers a CORS preflight
    const request: Outgoing = this.#authKey
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth: this.#authKey }),
        }
      : { method: 'GET' }
    const reply = await this.#send(`/get/${credentials.uuid}`, request, options)
    if (reply.status === 200 && isRecord(reply.body) && typeof reply.body.encrypted === 'string') {
      return decrypt(reply.body.encrypted, credentials)
    }
    // The server answers 403 both to a missing or wrong key and for a missing blob; only the message tells them apart
    const message = isRecord(reply.body) ? reply.body.message : undefined
    if (reply.status === 403 && message === 'Unauthorized') {
      throw new LoginSyncError(
        'unauthorized',
        this.#authKey ? 'the server rejected the auth key' : 'the server requires an auth key'
      )
    }
    if (reply.status === 403 && message === 'Invalid credentials') {
      throw new LoginSyncError('not_found', 'the server has no blob for this uuid')
    }
    throw serverError('the server returned no blob', reply)
  }

  /** Encrypts the payload as `options.version` and uploads it, replacing the blob stored under these credentials. */
  async push(
    payload: LoginSyncPayload,
    credentials: Credentials,
    options: EncryptOptions & RequestOptions
  ): Promise<void> {
    assertRoutable(credentials)
    const encrypted = await encrypt(payload, credentials, options)
    const reply = await this.#send(
      '/update',
      {
        method: 'POST',
        // The server gunzips every upload, whatever this header says
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: await gzip(JSON.stringify({ uuid: credentials.uuid, encrypted })),
      },
      options
    )
    if (isRecord(reply.body) && reply.body.action === 'done') return
    throw serverError('the server did not store the blob', reply)
  }

  /**
   * Deletes the blob stored under these credentials. The server deletes only a blob the password opens, so unlike `pull`
   * and `push`, this sends the password.
   */
  async remove(credentials: Credentials, options?: RequestOptions): Promise<void> {
    assertRoutable(credentials)
    const reply = await this.#send(
      '/remove',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ uuid: credentials.uuid, token: credentials.password }),
      },
      options
    )
    const code = isRecord(reply.body) ? reply.body.code : undefined
    if (code === 200) return
    // Both refusals carry `code: 403`, but only a missing blob sets the HTTP status too; a wrong password answers 200
    if (code === 403) {
      throw reply.status === 403
        ? new LoginSyncError('not_found', 'the server has no blob for this uuid')
        : new LoginSyncError('bad_credentials', 'the server could not open the blob with this password')
    }
    throw serverError('the server did not delete the blob', reply)
  }

  async #send(path: string, request: Outgoing, options: RequestOptions | undefined): Promise<Reply> {
    const headers = new Headers(this.#headers)
    // The protocol's own headers win over the caller's
    for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value)
    // Called through a local so `this` isn't the client, which the global fetch rejects in browsers as an illegal
    // invocation
    const fetchImpl = this.#fetch ?? fetch
    let status: number
    let text: string
    try {
      const response = await fetchImpl(this.baseURL + path, { ...request, headers, signal: options?.signal })
      status = response.status
      text = await response.text()
    } catch (cause) {
      // An abort the caller asked for, such as a timeout, keeps its own reason
      if (options?.signal?.aborted) throw cause
      throw new LoginSyncError('network_error', `could not reach ${this.baseURL}`, { cause })
    }
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      body = undefined
    }
    return { status, body }
  }
}

// The uuid becomes a path segment, so the server's pattern is also what keeps `/`, `?` and `..` out of the URL
function assertRoutable(credentials: Credentials): void {
  assertCredentials(credentials)
  if (!UUID_PATTERN.test(credentials.uuid)) {
    throw new LoginSyncError('invalid_token', 'uuid must be ASCII letters and digits')
  }
}

function serverError(summary: string, { status, body }: Reply): LoginSyncError {
  const detail = isRecord(body) && typeof body.message === 'string' ? `: ${body.message}` : ''
  return new LoginSyncError('server_error', `${summary} (HTTP ${status}${detail})`, { status })
}

// Buffered rather than streamed: a streamed body needs `duplex: 'half'`, which Firefox lacks and Chromium refuses over
// HTTP/1.x, and fetch can't resend a stream when it follows a 307 or 308 redirect
async function gzip(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}
