# laplace-login-sync-server

## 1.2.0

### Minor Changes

- bb4261f: detach from [CookieCloud](https://github.com/easychen/CookieCloud) on September 29, 2026. The project began as a fork of it and now continues independently, relicensed from GPL-3.0 to AGPL-3.0-only. AGPL adds one condition to GPL's: a modified version that users interact with over a network must offer those users its source. Releases before this one stay under GPL-3.0

## 1.1.0

### Minor Changes

- 4e603b8: fail closed when private mode is misconfigured, and cap decompression on `/update`.
  
  `LAPLACE_LOGIN_SYNC_AUTH_MODE` set with an empty or missing `LAPLACE_LOGIN_SYNC_AUTH_KEY` now refuses to start. It used to start clean and serve every blob to anyone: the route checks skipped a key that wasn't set, so a dropped secret or a mistyped variable name silently disabled private mode. **Check both variables before upgrading** — a deployment relying on that fail-open will not boot. Unset the mode to run a public server on purpose. The key is also trimmed now, so one stored with surrounding whitespace matches the token the routes compare it against instead of never matching.
  
  `/update`'s 4 MB `bodyLimit` only ever saw the compressed body, so a few MB of zeros inflated to gigabytes in one synchronous `unzipSync`, stalling every other request while it allocated. The decompressor now stops at 8 MB, twice the body limit: gzip shrinks base64 ciphertext to about 3/4 of its size, so a real upload just under 4 MB inflates to 5.3 MB, and every upload the body limit admits still goes through. A body over the cap answers 413 with `Body too large`, where a malformed one still answers 400.

### Patch Changes

- 86c968b: read protocol v2 blobs in the revised format of `@laplace.live/login-sync`
