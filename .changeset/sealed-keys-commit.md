---
"@laplace.live/login-sync": minor
---

revise protocol v2 before anything writes it, keeping tokens as they are, so moving a writer to v2 asks nothing of users. The PBKDF2 output now feeds HKDF, which derives the AES-256-GCM key and a key commitment that readers check before decrypting, so one crafted blob can no longer test many passwords at once. `encrypt` pads v2 plaintexts to a multiple of 1024 bytes, so a blob's length no longer tracks its payload's. Blobs that 1.0.0 wrote as v2 no longer open, and 1.0.0 reads the revised v2 as `bad_credentials`; no extension or server release ever wrote v2
