// `bun test` runs the TypeScript source under Bun; this runs the built dist/ that npm ships, under Node, to catch ESM
// resolution mistakes and any API that exists in Bun but not on the web platform.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { decrypt, encrypt, LoginSyncClient, parseToken, SUPPORTED_VERSIONS } from '../dist/index.js'

const vectors = JSON.parse(await readFile(new URL('../vectors.json', import.meta.url), 'utf8'))
for (const vector of [...vectors.v1.payload, ...vectors.v2]) {
  const { payload } = await decrypt(vector.blob, vector)
  // Parsing drops the trailing spaces v2 writers pad with
  assert.equal(JSON.stringify(payload), vector.plaintext.trimEnd(), vector.name)
}

const credentials = parseToken('smoke123@correct-horse')
const payload = { cookie_data: { 'bilibili.com': [] }, local_storage_data: {} }
for (const version of SUPPORTED_VERSIONS) {
  const blob = await encrypt(payload, credentials, { version })
  assert.deepEqual(await decrypt(blob, credentials), { version, payload })
}

// The client against a stub server: push has to gzip with Node's CompressionStream, and pull opens what push stored
let stored
const client = new LoginSyncClient({
  baseURL: 'https://sync.example',
  fetch: async (url, init) => {
    if (url === 'https://sync.example/update') {
      stored = await new Response(new Blob([init.body]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
      return Response.json({ action: 'done' })
    }
    return Response.json({ encrypted: stored.encrypted })
  },
})
await client.push(payload, credentials, { version: 2 })
assert.deepEqual(await client.pull(credentials), { version: 2, payload })

console.log(`dist/ passes on Node ${process.version}`)
