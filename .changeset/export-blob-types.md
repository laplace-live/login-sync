---
"@laplace.live/login-sync": minor
---

export `StoredBlob` and `BlobUpload`, the types of the JSON around a blob: what a sync server returns from `/get/:uuid` and stores (`{ encrypted }`), and what it takes on `/update` (`{ uuid, encrypted }`)
