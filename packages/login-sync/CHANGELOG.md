# @laplace.live/login-sync

## 1.2.0

### Minor Changes

- bb4261f: detach from [CookieCloud](https://github.com/easychen/CookieCloud) on September 29, 2026. The project began as a fork of it and now continues independently, relicensed from GPL-3.0 to AGPL-3.0-only. AGPL adds one condition to GPL's: a modified version that users interact with over a network must offer those users its source. Releases before this one stay under GPL-3.0
- 23ee589: export `StoredBlob` and `BlobUpload`, the types of the JSON around a blob: what a sync server returns from `/get/:uuid` and stores (`{ encrypted }`), and what it takes on `/update` (`{ uuid, encrypted }`)

### Patch Changes

- 23ee589: let the `fetch` option of `LoginSyncClient` return a `Response` as well as a promise of one. A Hono app's `app.fetch` returns either, so passing it to talk to a server in the same process no longer fails to typecheck

## 1.1.0

### Minor Changes

- 86c968b: revise protocol v2 before anything writes it, keeping tokens as they are, so moving a writer to v2 asks nothing of users. The PBKDF2 output now feeds HKDF, which derives the AES-256-GCM key and a key commitment that readers check before decrypting, so one crafted blob can no longer test many passwords at once. `encrypt` pads v2 plaintexts to a multiple of 1024 bytes, so a blob's length no longer tracks its payload's. Blobs that 1.0.0 wrote as v2 no longer open, and 1.0.0 reads the revised v2 as `bad_credentials`; no extension or server release ever wrote v2
- 7d836b3: add `LoginSyncClient`, a fetch-based client for the sync server: `pull`, `push` and `remove` encrypt and decrypt locally, and `baseURL` defaults to `https://login-sync.laplace.cn`. Adds the `not_found`, `unauthorized`, `network_error` and `server_error` error codes, and `status` on `server_error`

### Patch Changes

- 43149f2: keep trailing whitespace in the password `parseToken` returns: PROTOCOL.md allows any non-empty password, and trimming the whole token left a hand-typed one ending in a space unable to open its blob. Only whitespace before the uuid is dropped now, so trim a token read from a file or a terminal yourself when its password can't end in whitespace. `encrypt` and `decrypt` also reject a uuid outside `^[a-zA-Z0-9]+$` as `invalid_token`, as `parseToken` and the server already did, and `encrypt` checks its JSON the way a reader parses it, so a cookie's `toJSON` can no longer write a blob readers reject
- c9a0a2c: key the v2 key cache by a digest instead of the password, write exactly the payload `encrypt` checked, require string values in `local_storage_data` as PROTOCOL.md specifies, add error vectors for v1's envelope checks and v2's UTF-8 check, speed up base64 on large blobs, and drop the retired client-python from PROTOCOL.md's readers
