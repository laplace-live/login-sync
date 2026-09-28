import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rmdir, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encrypt, LoginSyncClient, SUPPORTED_VERSIONS } from '@laplace.live/login-sync'

// These tests write, overwrite and delete blobs, and the server's default data directory holds real ones. The server
// reads the variable once, when it's imported, so it's set before the import
const dataDir = await mkdtemp(join(tmpdir(), 'login-sync-test-'))
process.env.LAPLACE_LOGIN_SYNC_DATA_DIR = dataDir
const { default: app } = await import('./')

describe('events', () => {
  test('should return the correct response', async () => {
    const req = new Request('http://localhost/')
    const res = await app.fetch(req)
    expect(res.status).toBe(200)
  })
})

describe('password routes', () => {
  // Private mode comes from the environment and Bun loads .env into tests, so send the key whenever one is set
  const auth = process.env.LAPLACE_LOGIN_SYNC_AUTH_KEY
  const password = 'correct-horse-battery'
  const payload = {
    cookie_data: {
      'bilibili.com': [
        {
          domain: '.bilibili.com',
          hostOnly: false,
          httpOnly: true,
          name: 'SESSDATA',
          path: '/',
          sameSite: 'unspecified',
          secure: true,
          session: false,
          storeId: '0',
          value: 'fake-session-value',
        },
      ],
    },
    local_storage_data: { 'laplace.live': { loginSyncOptionSendDanmaku: 'true' } },
  }
  const versions = [...SUPPORTED_VERSIONS]
  const written: string[] = []

  const request = (path: string, init?: RequestInit) => app.fetch(new Request(`http://localhost${path}`, init))
  const readWithPassword = (uuid: string, password: string) =>
    request(`/get/${uuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, auth }),
    })
  const remove = (uuid: string, token: string) =>
    request('/remove', { method: 'POST', body: new URLSearchParams({ uuid, token }) })

  afterAll(async () => {
    // Clear out whatever a failed run left behind, then the directory. Not recursively: if something unexpected is
    // still in there, the empty-directory check keeps it
    await Promise.all(written.map(uuid => unlink(`${dataDir}/${uuid}.json`).catch(() => {})))
    await rmdir(dataDir).catch(() => {})
  })

  test.each(versions)('v%d: store, read back with the password, refuse wrong ones, delete', async version => {
    const uuid = `test${crypto.randomUUID().replaceAll('-', '')}`
    written.push(uuid)

    const encrypted = await encrypt(payload, { uuid, password }, { version })
    const update = await request('/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: Bun.gzipSync(JSON.stringify({ uuid, encrypted })),
    })
    expect(await update.json()).toEqual({ action: 'done' })

    const read = await readWithPassword(uuid, password)
    expect(read.status).toBe(200)
    expect(await read.json()).toEqual(payload)
    expect((await readWithPassword(uuid, 'wrong-password')).status).toBe(403)

    expect(await (await remove(uuid, 'wrong-password')).json()).toMatchObject({ code: 403 })
    expect(await Bun.file(`${dataDir}/${uuid}.json`).exists()).toBe(true)
    expect(await (await remove(uuid, password)).json()).toMatchObject({ code: 200 })
    expect(await Bun.file(`${dataDir}/${uuid}.json`).exists()).toBe(false)
  })

  // The SDK client tells its errors apart by these routes' statuses and messages, so this pins both sides of that
  const clientFor = (authKey: string | undefined) =>
    new LoginSyncClient({
      baseURL: 'http://localhost',
      authKey,
      fetch: (url, init) => app.fetch(new Request(url, init)),
    })

  test.each(versions)('v%d: the SDK client pushes, pulls and removes', async version => {
    const client = clientFor(auth)
    const credentials = { uuid: `test${crypto.randomUUID().replaceAll('-', '')}`, password }
    written.push(credentials.uuid)

    await client.push(payload, credentials, { version })
    expect(await client.pull(credentials)).toEqual({ version, payload })

    await expect(client.remove({ ...credentials, password: 'wrong-password' })).rejects.toHaveProperty(
      'code',
      'bad_credentials'
    )
    await client.remove(credentials)
    await expect(client.pull(credentials)).rejects.toHaveProperty('code', 'not_found')
    await expect(client.remove(credentials)).rejects.toHaveProperty('code', 'not_found')
  })

  // Private mode is read once, at import, so this runs only when the environment turns it on
  test.if(process.env.LAPLACE_LOGIN_SYNC_AUTH_MODE !== undefined && Boolean(auth))(
    'the SDK client reports a wrong auth key as unauthorized',
    async () => {
      const pending = clientFor('wrong-key').pull({ uuid: 'anyone', password })
      await expect(pending).rejects.toHaveProperty('code', 'unauthorized')
    }
  )
})
