// `bun test` runs the TypeScript source under Bun; this runs the built dist/ that npm ships, under Node, to catch ESM
// resolution mistakes and any API that exists in Bun but not on the web platform.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { decrypt, encrypt, parseToken, SUPPORTED_VERSIONS } from '../dist/index.js'

const vectors = JSON.parse(await readFile(new URL('../vectors.json', import.meta.url), 'utf8'))
for (const vector of [...vectors.v1.payload, ...vectors.v2]) {
  const { payload } = await decrypt(vector.blob, vector)
  assert.equal(JSON.stringify(payload), vector.plaintext, vector.name)
}

const credentials = parseToken('smoke123@correct-horse')
const payload = { cookie_data: { 'bilibili.com': [] }, local_storage_data: {} }
for (const version of SUPPORTED_VERSIONS) {
  const blob = await encrypt(payload, credentials, { version })
  assert.deepEqual(await decrypt(blob, credentials), { version, payload })
}

console.log(`dist/ passes on Node ${process.version}`)
