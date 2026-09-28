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

describe('/update limits', () => {
  const uuid = 'inflationtest'

  afterAll(async () => {
    await unlink(`${dataDir}/${uuid}.json`).catch(() => {})
  })

  test('refuses a body that inflates past the size cap', async () => {
    // `bodyLimit` only sees the compressed body, so the guard that matters is the decompressor's own output cap. This
    // gzips to a few KB and inflates to 8 MB: uncapped it parses and stores, answering `done`, which is what makes this
    // a regression test for the cap rather than for the JSON check
    const body = Bun.gzipSync(JSON.stringify({ uuid, encrypted: 'A'.repeat(8 * 1024 * 1024) }))
    expect(body.byteLength).toBeLessThan(64 * 1024)

    const res = await app.fetch(new Request('http://localhost/update', { method: 'POST', body }))
    expect(res.status).toBe(413)
    expect(await Bun.file(`${dataDir}/${uuid}.json`).exists()).toBe(false)
  })
})

describe('private mode configuration', () => {
  // The mode is read once, at import, so a second configuration needs a second process
  test('refuses to start when the mode is set without a key', async () => {
    const proc = Bun.spawn(['bun', join(import.meta.dir, 'index.ts')], {
      env: {
        ...process.env,
        LAPLACE_LOGIN_SYNC_AUTH_MODE: 'true',
        LAPLACE_LOGIN_SYNC_AUTH_KEY: '',
        LAPLACE_LOGIN_SYNC_DATA_DIR: dataDir,
        // A regression would start a real server instead of throwing; port 0 keeps it off the one a dev server holds
        PORT: '0',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    })
    // Without this, that regression would hang on `exited` rather than fail. The stderr check below is what actually
    // distinguishes refusing to start from being killed here
    const killer = setTimeout(() => proc.kill(), 10_000)
    try {
      const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()])
      expect(stderr).toContain('LAPLACE_LOGIN_SYNC_AUTH_KEY')
      expect(exitCode).not.toBe(0)
    } finally {
      clearTimeout(killer)
    }
  }, 15_000)
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
