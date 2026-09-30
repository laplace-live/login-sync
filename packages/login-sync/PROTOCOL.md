# LAPLACE Login Sync Protocol

How LAPLACE Login Sync encrypts a browser's cookies so that the sync server only ever stores ciphertext. The extension
writes blobs; the server's password-taking routes and the LAPLACE workers read them.
`@laplace.live/login-sync` is the reference implementation, and every implementation must pass
[`vectors.json`](./vectors.json).

## Token

A user's secret is the token the extension displays: `<uuid>@<password>`.

- `uuid`: ASCII letters and digits only. It's a short-uuid, not an RFC 4122 UUID. The server names the blob file after
  it and rejects anything outside `^[a-zA-Z0-9]+$`.
- `password`: any non-empty string, used as its UTF-8 bytes exactly as given: no trimming, no Unicode normalization.
  The extension generates 22 base58 characters (122 random bits); older installs may hold hand-typed passwords.

The uuid can't contain `@`, so split on the first `@`.

## Blob and Version Detection

The server stores one blob per uuid as `{ "encrypted": "<blob>" }`. Its version is read from its prefix, never by
trying keys:

| Blob starts with               | Version                                          |
| ------------------------------ | ------------------------------------------------ |
| `U2FsdGVkX1`                   | v1 (the base64 of the OpenSSL `Salted__` header) |
| `v2:`                          | v2                                               |
| `vN:`, N ≥ 3                   | a future version: fail as `unsupported_version`  |
| anything else, including `v1:` | not a blob: fail as `malformed`                  |

Tags start at v2 because v1 predates them. `:` is outside the base64 alphabet, so a tagged blob can never be mistaken
for v1. A tag is `v`, a decimal number without leading zeros, and `:`.

Every version's base64 uses the standard alphabet and is written with padding. Readers decode it as `atob` does:
padding optional, ASCII whitespace skipped.

## Plaintext

Every version encrypts the UTF-8 bytes of one JSON object:

```json
{
  "cookie_data": {
    "bilibili.com": [
      {
        "name": "SESSDATA",
        "value": "…",
        "domain": ".bilibili.com",
        "path": "/"
      }
    ]
  },
  "local_storage_data": {
    "laplace.live": { "loginSyncOptionSendDanmaku": "true" }
  }
}
```

- `cookie_data` (required): cookie arrays keyed by the domain the extension queried. Each cookie is what
  `browser.cookies.getAll()` returns.
- `local_storage_data`: string maps keyed by host. Some writers omit it; read a missing one as `{}`.

The server's `/remove` accepts a decrypted `cookie_data` as proof that the caller knows the password, so the key names
are part of the contract. Readers pass unknown top-level fields through.

## v1: CryptoJS Passphrase Format

What CookieCloud defined and every extension build to date writes, equal to
`CryptoJS.AES.encrypt(json, passphrase).toString()`:

1. `passphrase` = the first 16 characters of the lowercase hex MD5 of UTF-8 `uuid + "-" + password`
2. `salt` = 8 random bytes
3. OpenSSL `EVP_BytesToKey` with MD5 and one iteration, `S = passphrase ‖ salt`:
   `D1 = MD5(S)`, `D2 = MD5(D1 ‖ S)`, `D3 = MD5(D2 ‖ S)`; `key = D1 ‖ D2`, `iv = D3`
4. AES-256-CBC with PKCS#7 padding
5. `blob = base64("Salted__" ‖ salt ‖ ciphertext)`

A reader fails as `malformed` when the decoded blob is shorter than 32 bytes, isn't a multiple of 16 bytes, or doesn't
start with `Salted__`. It fails as `bad_credentials` when padding, UTF-8 decoding or JSON parsing fails: without an
integrity check, a wrong key is indistinguishable from damage.

The 16 hex characters cap the key at 64 bits whatever the password, and CBC detects no tampering. Read v1 for as long
as v1 blobs may sit on a server; don't adopt it for anything new.

## v2: PBKDF2-SHA256, HKDF and AES-256-GCM Format

1. `master` = PBKDF2-HMAC-SHA256 with
   - password: UTF-8 `password`
   - salt: UTF-8 `"laplace-login-sync/v2:" + uuid`
   - iterations: 100000
   - length: 32 bytes
2. HKDF-SHA256 ([RFC 5869](https://www.rfc-editor.org/rfc/rfc5869)) over `master`, with an empty salt, derives two
   32-byte values:
   - `key`, with info UTF-8 `"laplace-login-sync/v2/encrypt"`
   - `commitment`, with info UTF-8 `"laplace-login-sync/v2/commit"`
3. `nonce` = 12 bytes from a cryptographically secure random generator. Never a counter: every browser holding the
   token writes under the same key without coordinating.
4. AES-256-GCM under `key`, with a 128-bit tag and additional authenticated data UTF-8 `"v2:" + uuid`
5. `blob = "v2:" + base64(commitment ‖ nonce ‖ ciphertext ‖ tag)`

Writers pad the plaintext with trailing spaces to a multiple of 1024 bytes. JSON allows whitespace after the value, so
readers parse the padding away, whatever its length.

Every parameter is fixed by the tag. Never read an iteration count or algorithm from a blob: anyone who can write to
the server could then choose a weak or ruinously slow key derivation for every reader.

A reader checks the commitment before decrypting. It fails as `malformed` when the body isn't base64, is shorter than
60 bytes, or authenticates but isn't UTF-8 JSON of the shape above. It fails as `bad_credentials` when the commitment
doesn't match or the tag doesn't verify: wrong token, wrong uuid, or a modified blob.

- **Uuid-bound salt.** It makes every token's key unique and lets readers derive the key once per token and cache it.
- **Subkeys, not the PBKDF2 output.** The expensive derivation runs once, and each purpose gets its own key from it. A
  new purpose, such as a delete token the server could check without ever seeing the password, takes a new label and
  leaves the blob format alone.
- **Key commitment.** GCM alone doesn't bind a ciphertext to one key: a crafted blob can authenticate under many
  password guesses at once, so any reader whose reaction an attacker can observe becomes a fast guessing oracle. The
  commitment pins each blob to the one key that wrote it. It hands an attacker nothing new, since the tag already
  checks a guess at the same PBKDF2 cost, and it isn't secret, so it needs no constant-time comparison.
- **Uuid in the authenticated data.** A blob can't be replayed under another user's uuid.
- **Padding.** GCM ciphertext is exactly as long as its plaintext, and a public server hands blobs to anyone who knows
  a uuid. Padding hides small changes, such as one cookie's length, for at most 1023 bytes per blob. Readers never
  depend on the size, so writers can change it without a new version.
- **100,000 iterations.** Cloudflare Workers rejects PBKDF2 above 100,000 iterations in production, and neither
  `wrangler dev` nor open-source workerd enforces the cap, so a higher count would pass local tests and break Worker
  readers in production. Generated passwords carry 122 random bits, so the stretching is defense in depth.

## Errors

| Code                  | Meaning                                                                   |
| --------------------- | ------------------------------------------------------------------------- |
| `invalid_token`       | The token or credentials are unusable (empty, or no valid `uuid@`)        |
| `malformed`           | Not a login-sync blob, or its encoding or payload is broken               |
| `unsupported_version` | A tag newer than the reader: the reader needs an upgrade, not a new token |
| `bad_credentials`     | The token can't open this blob, or the blob was damaged or tampered with  |

## Changing the Protocol

- **Never change an existing version.** Different parameters get a new tag.
- **Readers ship before writers.** Detection lets a new reader open old blobs; nothing lets an old reader open new
  ones. Write a version only after every reader understands it.
- **Keep reading old versions.** A user whose extension stops syncing keeps their last blob on the server
  indefinitely.
- **Vectors are frozen.** Add new ones to `vectors.json`; never edit or remove existing ones. The v1 vectors are
  crypto-js 4.2.0 output.
