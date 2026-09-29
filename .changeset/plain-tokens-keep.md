---
"@laplace.live/login-sync": patch
---

keep trailing whitespace in the password `parseToken` returns: PROTOCOL.md allows any non-empty password, and trimming the whole token left a hand-typed one ending in a space unable to open its blob. Only whitespace before the uuid is dropped now, so trim a token read from a file or a terminal yourself when its password can't end in whitespace. `encrypt` and `decrypt` also reject a uuid outside `^[a-zA-Z0-9]+$` as `invalid_token`, as `parseToken` and the server already did, and `encrypt` checks its JSON the way a reader parses it, so a cookie's `toJSON` can no longer write a blob readers reject
