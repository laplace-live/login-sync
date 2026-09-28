---
"@laplace.live/login-sync": patch
---

key the v2 key cache by a digest instead of the password, write exactly the payload `encrypt` checked, require string values in `local_storage_data` as PROTOCOL.md specifies, add error vectors for v1's envelope checks and v2's UTF-8 check, speed up base64 on large blobs, and drop the retired client-python from PROTOCOL.md's readers
