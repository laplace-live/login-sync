# @laplace.live/login-sync

Encrypt, decrypt and version-detect LAPLACE Login Sync payloads, the blobs the extension uploads and the sync server
stores, and move them to and from that server. One implementation of the [protocol](./PROTOCOL.md) for every runtime:
browsers and extensions, Bun, Node 20+ and Cloudflare Workers. It uses only web platform APIs and has no dependencies.

```sh
bun add @laplace.live/login-sync
```

## Client

`LoginSyncClient` talks to a sync server over `fetch`. It encrypts and decrypts locally, so `pull` and `push` never send
the password:

```ts
import {
  isLoginSyncError,
  LoginSyncClient,
  parseToken,
} from "@laplace.live/login-sync";

const client = new LoginSyncClient({
  authKey: env.LAPLACE_LOGIN_SYNC_AUTH_KEY,
  // Sent with every request. A placeholder: use the header and token your firewall actually checks
  headers: { "x-example-waf-token": env.WAF_TOKEN },
});
const credentials = parseToken(token); // 'uuid@password'

try {
  const { version, payload } = await client.pull(credentials);
  const cookies = payload.cookie_data["bilibili.com"] ?? [];
} catch (error) {
  if (!isLoginSyncError(error)) throw error;
  error.code; // 'not_found' | 'bad_credentials' | 'network_error' | …
}

await client.push(payload, credentials, { version: 1 });
await client.remove(credentials);
```

| Option    | Default                         | Purpose                                                                     |
| --------- | ------------------------------- | --------------------------------------------------------------------------- |
| `baseURL` | `https://login-sync.laplace.cn` | The server as an absolute URL, optionally with a path prefix                |
| `authKey` |                                 | The key a server in private mode requires for reads                         |
| `headers` |                                 | Sent with every request, e.g. a token for a firewall in front of the server |
| `fetch`   | the global `fetch`              | Wraps or replaces it, e.g. to cache responses. It's called without a `this` |

Each method also takes a `signal`, e.g. `client.pull(credentials, { signal: AbortSignal.timeout(10_000) })`.

- `remove` sends the password: the server deletes a blob only after opening it.
- A firewall in front of the server, such as Cloudflare's, may answer a server-side caller with a challenge page. That
  surfaces as a `server_error` with `status` 403. Send whatever header the firewall expects in `headers`, as above.
- An `authKey` travels in a POST body, never in the URL. Without one, `pull` is a GET, and browsers may answer it from
  their cache for up to 5 seconds, as the server's `Cache-Control` allows. For fresh reads, pass
  `fetch: (url, init) => fetch(url, { ...init, cache: "no-store" })`.

## Blobs

The client is built on `decrypt` and `encrypt`, which work on a blob you fetch or store yourself. `decrypt` opens a blob
in any supported version and tells you which one it was:

```ts
import { decrypt, encrypt } from "@laplace.live/login-sync";

const { version, payload } = await decrypt(encrypted, credentials); // `encrypted` from the server's /get/:uuid
const blob = await encrypt(payload, credentials, { version: 1 });
```

`encrypt` and `push` require the version to write. A version may only be written once every reader understands it.
There's no default, so upgrading the SDK never changes the format you write.

Deriving a v2 key costs about 10 ms, so keys are cached per token (up to 256 tokens).

## Errors

Everything the SDK throws for bad input or a failed request is a `LoginSyncError`; an aborted request rejects with the
signal's reason instead. Branch on `code`:

| Code                  | Meaning                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------- |
| `invalid_token`       | The token or credentials are unusable                                                                     |
| `malformed`           | Not a login-sync blob, or its encoding or payload is broken                                               |
| `unsupported_version` | Written by a newer protocol version: upgrade this package                                                 |
| `bad_credentials`     | The token can't open this blob, or the blob was damaged or tampered with                                  |
| `not_found`           | The server has no blob for this uuid                                                                      |
| `unauthorized`        | The server is in private mode, and `authKey` is missing or wrong                                          |
| `network_error`       | No response arrived: the server is unreachable, or a browser blocked the request                          |
| `server_error`        | The server answered with an error, or something else answered, such as a proxy's error page. See `status` |

## Versions

| Version | Format                                                                | Status                                  |
| ------- | --------------------------------------------------------------------- | --------------------------------------- |
| v1      | CryptoJS AES passphrase format (CookieCloud)                          | What every extension build writes today |
| v2      | PBKDF2-SHA256 (100,000 iterations), HKDF, AES-256-GCM, key commitment | Read by this SDK; not written yet       |

[`vectors.json`](./vectors.json) ships with the package and holds known-answer vectors for ports to other languages.
