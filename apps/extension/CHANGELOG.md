# laplace-login-sync

## 2.2.0

### Minor Changes

- 952303c: encrypt uploads with protocol v2. v1 cut every key down to 64 bits whatever the password and couldn't detect a modified blob; v2 stretches the full password with PBKDF2-SHA256 and seals the payload with AES-256-GCM behind a key commitment. Sync tokens stay exactly as they are, and each user's blob moves to v2 on its next sync

### Patch Changes

- Updated dependencies [952303c]
  - @laplace.live/login-sync@1.2.1

## 2.1.0

### Minor Changes

- bb4261f: detach from [CookieCloud](https://github.com/easychen/CookieCloud) on September 29, 2026. The project began as a fork of it and now continues independently, relicensed from GPL-3.0 to AGPL-3.0-only. AGPL adds one condition to GPL's: a modified version that users interact with over a network must offer those users its source. Releases before this one stay under GPL-3.0

### Patch Changes

- Updated dependencies [bb4261f]
- Updated dependencies [23ee589]
- Updated dependencies [23ee589]
  - @laplace.live/login-sync@1.2.0

## 2.0.9

### Patch Changes

- 96fcd38: upgrade wxt to 0.21 and publish to the Chrome Web Store via API v2
- 7d836b3: upload through the SDK's `LoginSyncClient`
- 04e6416: replace pako with the built-in CompressionStream
- ef00c0a: replace clsx and tailwind-merge with cn
- e8bc79d: replace crypto-js with the built-in Web Crypto API
- Updated dependencies [43149f2]
- Updated dependencies [c9a0a2c]
- Updated dependencies [86c968b]
- Updated dependencies [7d836b3]
  - @laplace.live/login-sync@1.1.0

## 2.0.8

### Patch Changes

- 6bb42cd: update radix

## 2.0.7

### Patch Changes

- dca5c48: update button

## 2.0.6

### Patch Changes

- 1d4261a: fix popup animations

## 2.0.5

### Patch Changes

- ca7e2ec: fix release process

## 2.0.4

### Patch Changes

- f2d0520: fix release process

## 2.0.3

### Patch Changes

- 396d968: fix release process

## 2.0.2

### Patch Changes

- 7161561: fix release

## 2.0.1

### Patch Changes

- 0216f86: prepare extension v2 release
