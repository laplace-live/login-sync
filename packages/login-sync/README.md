# @laplace.live/login-sync

Encrypt, decrypt and version-detect LAPLACE Login Sync payloads, the blobs the extension uploads and the sync server
stores. One implementation of the [protocol](./PROTOCOL.md) for every runtime: browsers and extensions, Bun, Node 20+
and Cloudflare Workers. It uses only Web Crypto and has no dependencies.

```sh
bun add @laplace.live/login-sync
```

## Reading

`decrypt` opens a blob in any supported version and tells you which one it was:

```ts
import {
  decrypt,
  isLoginSyncError,
  parseToken,
} from "@laplace.live/login-sync";

const credentials = parseToken(token); // 'uuid@password'
const { encrypted } = await fetchBlob(credentials.uuid); // `{ encrypted }` from the sync server's /get/:uuid

try {
  const { version, payload } = await decrypt(encrypted, credentials);
  const cookies = payload.cookie_data["bilibili.com"] ?? [];
} catch (error) {
  if (!isLoginSyncError(error)) throw error;
  error.code; // 'invalid_token' | 'malformed' | 'unsupported_version' | 'bad_credentials'
}
```

Deriving a v2 key costs about 10 ms, so keys are cached per token (up to 256 tokens).

## Writing

`encrypt` requires the version to write:

```ts
import { encrypt } from "@laplace.live/login-sync";

const encrypted = await encrypt(payload, credentials, { version: 1 });
```

A version may only be written once every reader understands it. There's no default, so upgrading the SDK never
changes the format you write.

## Errors

Everything thrown for bad input is a `LoginSyncError`. Branch on `code`:

| Code                  | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `invalid_token`       | The token or credentials are unusable                                    |
| `malformed`           | Not a login-sync blob, or its encoding or payload is broken              |
| `unsupported_version` | Written by a newer protocol version: upgrade this package                |
| `bad_credentials`     | The token can't open this blob, or the blob was damaged or tampered with |

## Versions

| Version | Format                                          | Status                                  |
| ------- | ----------------------------------------------- | --------------------------------------- |
| v1      | CryptoJS AES passphrase format (CookieCloud)    | What every extension build writes today |
| v2      | PBKDF2-SHA256 (100,000 iterations), AES-256-GCM | Readable everywhere; not written yet    |

[`vectors.json`](./vectors.json) ships with the package and holds known-answer vectors for ports to other languages.
