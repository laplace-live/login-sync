---
"@laplace.live/login-sync": minor
---

add `LoginSyncClient`, a fetch-based client for the sync server: `pull`, `push` and `remove` encrypt and decrypt locally, and `baseURL` defaults to `https://login-sync.laplace.cn`. Adds the `not_found`, `unauthorized`, `network_error` and `server_error` error codes, and `status` on `server_error`
