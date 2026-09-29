---
"laplace-login-sync": minor
---

encrypt uploads with protocol v2. v1 cut every key down to 64 bits whatever the password and couldn't detect a modified blob; v2 stretches the full password with PBKDF2-SHA256 and seals the payload with AES-256-GCM behind a key commitment. Sync tokens stay exactly as they are, and each user's blob moves to v2 on its next sync
