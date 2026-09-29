import { describe, expect, spyOn, test } from 'bun:test'

import type { LoginSyncPayload } from './index.js'

import { decrypt, encrypt, LoginSyncClient, LoginSyncError } from './index.js'

const credentials = { uuid: 'sQ4b8nKx2PzT7wYc9dLmRe', password: 'Hj3Vn8Qw2Zr5Tk9Bx4Mc7p' }
const payload = {
  cookie_data: { 'bilibili.com': [] },
  local_storage_data: { 'laplace.live': { loginSyncOptionSendDanmaku: 'true' } },
} satisfies LoginSyncPayload

/** A client whose fetch records each request and answers with `respond`. */
function withServer(respond: (request: Request) => Response | Promise<Response>, options = {}) {
  const requests: Request[] = []
  const client = new LoginSyncClient({
    baseURL: 'https://sync.example',
    ...options,
    fetch: async (url, init) => {
      const request = new Request(url, init)
      requests.push(request.clone())
      return respond(request)
    },
  })
  return { client, requests }
}

async function gunzipJson(request: Request): Promise<unknown> {
  const stream = new Blob([await request.arrayBuffer()]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text())
}

describe('fetch option', () => {
  test('accepts a handler that answers without a promise, like a Hono app', async () => {
    const encrypted = await encrypt(payload, credentials, { version: 2 })
    const client = new LoginSyncClient({ baseURL: 'https://sync.example', fetch: () => Response.json({ encrypted }) })
    expect(await client.pull(credentials)).toEqual({ version: 2, payload })
  })

  test('reports a handler that throws before answering as a network_error', async () => {
    const client = new LoginSyncClient({
      baseURL: 'https://sync.example',
      fetch: () => {
        throw new TypeError('no route')
      },
    })
    await expect(client.pull(credentials)).rejects.toMatchObject({ code: 'network_error' })
  })
})

describe('baseURL', () => {
  test('defaults to login-sync.laplace.cn through the global fetch', async () => {
    // Bun's fetch type carries `preconnect`, so the stub needs one too
    const stub = Object.assign(async () => Response.json({ action: 'done' }), { preconnect: fetch.preconnect })
    const spy = spyOn(globalThis, 'fetch').mockImplementation(stub)
    try {
      await new LoginSyncClient().push(payload, credentials, { version: 1 })
      expect(spy.mock.calls[0]?.[0]).toBe('https://login-sync.laplace.cn/update')
    } finally {
      spy.mockRestore()
    }
  })

  test('keeps a path prefix and drops trailing slashes', async () => {
    const { client, requests } = withServer(() => Response.json({ action: 'done' }), {
      baseURL: 'http://localhost:8088/sync//',
    })
    expect(client.baseURL).toBe('http://localhost:8088/sync')
    await client.push(payload, credentials, { version: 1 })
    expect(requests[0]?.url).toBe('http://localhost:8088/sync/update')
  })

  test('rejects anything but an absolute URL up front', () => {
    expect(() => new LoginSyncClient({ baseURL: 'login-sync.example' })).toThrow(TypeError)
    expect(() => new LoginSyncClient({ baseURL: '' })).toThrow(TypeError)
  })
})

describe('push', () => {
  test('gzips { uuid, encrypted } to /update, with custom headers alongside the protocol ones', async () => {
    const { client, requests } = withServer(() => Response.json({ action: 'done' }), {
      headers: { 'x-example-waf-token': 'token', 'Content-Encoding': 'br' },
    })
    await client.push(payload, credentials, { version: 2 })

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('https://sync.example/update')
    expect(request?.headers.get('Content-Type')).toBe('application/json')
    expect(request?.headers.get('Content-Encoding')).toBe('gzip')
    expect(request?.headers.get('x-example-waf-token')).toBe('token')

    const body = request && (await gunzipJson(request))
    expect(body).toEqual({ uuid: credentials.uuid, encrypted: expect.stringMatching(/^v2:/) })
    const encrypted = typeof body === 'object' && body !== null && 'encrypted' in body ? body.encrypted : undefined
    expect(await decrypt(String(encrypted), credentials)).toEqual({ version: 2, payload })
  })

  test.each([
    ['a failed write', 200, { action: 'error' }],
    ['a done body with a failing status', 502, { action: 'done' }],
    ['a rejected body', 400, { code: 400, message: 'Request body error' }],
    ['the body limit', 413, 'Body too large 😅'],
  ])('reports %s as server_error', async (_, status, body) => {
    const { client } = withServer(() =>
      typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status })
    )
    const pending = client.push(payload, credentials, { version: 1 })
    await expect(pending).rejects.toMatchObject({ code: 'server_error', status })
  })
})

describe('pull', () => {
  test('GETs the blob and decrypts it locally', async () => {
    const encrypted = await encrypt(payload, credentials, { version: 1 })
    const { client, requests } = withServer(() => Response.json({ encrypted }))
    expect(await client.pull(credentials)).toEqual({ version: 1, payload })

    const [request] = requests
    expect(request?.method).toBe('GET')
    expect(request?.url).toBe(`https://sync.example/get/${credentials.uuid}`)
  })

  test('sends the auth key in a POST body, never in the URL', async () => {
    const encrypted = await encrypt(payload, credentials, { version: 2 })
    const { client, requests } = withServer(() => Response.json({ encrypted }), { authKey: 'private-key' })
    expect(await client.pull(credentials)).toEqual({ version: 2, payload })

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe(`https://sync.example/get/${credentials.uuid}`)
    expect(await request?.json()).toEqual({ auth: 'private-key' })
  })

  test.each([
    ['a missing or wrong auth key', 403, { code: 403, message: 'Unauthorized' }, 'unauthorized'],
    ['a missing blob', 403, { code: 403, message: 'Invalid credentials' }, 'not_found'],
    ["a firewall's challenge page", 403, '<!DOCTYPE html><title>Just a moment...</title>', 'server_error'],
    ['a server error', 500, { code: 500, message: 'Server error' }, 'server_error'],
    ['a blob that is not one', 200, { encrypted: 'not a blob' }, 'malformed'],
  ])('reports %s as %s', async (_, status, body, code) => {
    const { client } = withServer(() =>
      typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status })
    )
    await expect(client.pull(credentials)).rejects.toHaveProperty('code', code)
  })

  test('reports a blob the password does not open as bad_credentials', async () => {
    const encrypted = await encrypt(payload, { ...credentials, password: 'someone-else' }, { version: 2 })
    const { client } = withServer(() => Response.json({ encrypted }))
    await expect(client.pull(credentials)).rejects.toHaveProperty('code', 'bad_credentials')
  })
})

describe('remove', () => {
  test('posts the uuid and password as a form', async () => {
    const { client, requests } = withServer(() => Response.json({ code: 200, message: 'Done' }))
    await client.remove(credentials)

    const [request] = requests
    expect(request?.method).toBe('POST')
    expect(request?.url).toBe('https://sync.example/remove')
    const form = await request?.formData()
    expect(form?.get('uuid')).toBe(credentials.uuid)
    expect(form?.get('token')).toBe(credentials.password)
  })

  test.each([
    ['a wrong password', 200, { code: 403, message: 'Invalid credentials' }, 'bad_credentials'],
    ['a missing blob', 403, { code: 403, message: 'Invalid credentials' }, 'not_found'],
    ['a failed delete', 200, { code: 500, message: 'Error removing credentials' }, 'server_error'],
  ])('reports %s as %s', async (_, status, body, code) => {
    const { client } = withServer(() => Response.json(body, { status }))
    await expect(client.remove(credentials)).rejects.toHaveProperty('code', code)
  })
})

describe('requests', () => {
  test.each(['../update', 'abc?auth=x', 'a/b', ''])('refuse uuid %p before anything is sent', async uuid => {
    const { client, requests } = withServer(() => Response.json({ action: 'done' }))
    const pending = client.push(payload, { ...credentials, uuid }, { version: 1 })
    await expect(pending).rejects.toHaveProperty('code', 'invalid_token')
    expect(requests).toHaveLength(0)
  })

  test('wrap a failed fetch as network_error', async () => {
    const cause = new TypeError('fetch failed')
    const client = new LoginSyncClient({
      fetch: async () => {
        throw cause
      },
    })
    const pending = client.pull(credentials)
    await expect(pending).rejects.toBeInstanceOf(LoginSyncError)
    await expect(pending).rejects.toMatchObject({ code: 'network_error', cause })
  })

  test("reject with the signal's own reason on abort", async () => {
    const reason = new DOMException('timed out', 'TimeoutError')
    const client = new LoginSyncClient({
      fetch: async (_, init) => {
        init.signal?.throwIfAborted()
        return Response.json({ action: 'done' })
      },
    })
    const pending = client.push(payload, credentials, { version: 1, signal: AbortSignal.abort(reason) })
    await expect(pending).rejects.toBe(reason)
  })

  test('call fetch without the client as `this`', async () => {
    let receiver: unknown = 'not called'
    const client = new LoginSyncClient({
      fetch: async function (this: unknown) {
        receiver = this
        return Response.json({ action: 'done' })
      },
    })
    await client.push(payload, credentials, { version: 1 })
    expect(receiver).toBeUndefined()
  })
})
