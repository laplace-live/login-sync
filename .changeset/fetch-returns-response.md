---
"@laplace.live/login-sync": patch
---

let the `fetch` option of `LoginSyncClient` return a `Response` as well as a promise of one. A Hono app's `app.fetch` returns either, so passing it to talk to a server in the same process no longer fails to typecheck
