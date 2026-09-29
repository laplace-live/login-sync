import { unlink } from 'node:fs/promises'
import { unzipSync } from 'node:zlib'
import { zValidator } from '@hono/zod-validator'
import { decrypt, isLoginSyncError } from '@laplace.live/login-sync'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'
import { z } from 'zod'

import { timingSafeEqual } from './utils/timingSafeEqual'

interface CookieRequestBody {
  uuid: string
  encrypted: string
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8088

/**
 * The key the `/get` routes check reads against, or `undefined` when the server is public.
 *
 * `LAPLACE_LOGIN_SYNC_AUTH_MODE` is checked for presence, not truthiness, so `=false` still enables private mode. The
 * key is then mandatory, and this throws rather than returning `undefined`: the checks below skip a key that isn't set,
 * so a mode set without one used to leave both `/get` routes wide open — a dropped secret or a mistyped variable name
 * produced a server that started clean and served every blob to anyone. Refusing to boot turns that silent failure into
 * a crash on the one variable whose absence removes all access control.
 *
 * The key is trimmed because the routes compare it against a token Zod has already trimmed, so a stored key with
 * surrounding whitespace could never match one.
 */
function readAuthKey(): string | undefined {
  if (process.env.LAPLACE_LOGIN_SYNC_AUTH_MODE === undefined) return undefined
  const key = process.env.LAPLACE_LOGIN_SYNC_AUTH_KEY?.trim()
  if (!key) {
    throw new Error(
      'LAPLACE_LOGIN_SYNC_AUTH_MODE is set, so LAPLACE_LOGIN_SYNC_AUTH_KEY must hold a non-empty key. Refusing to ' +
        'start: private mode without a key would serve every blob to anyone. Unset the mode to run a public server.'
    )
  }
  return key
}

const authKey = readAuthKey()

// this code is inside ./src, so we need to go one level up to access the data folder. The tests point the variable at
// a temporary directory, because they write and delete blobs
const dataDir = process.env.LAPLACE_LOGIN_SYNC_DATA_DIR || `${import.meta.dir}/../data`

const zStringNotEmpty = (msg?: string) =>
  z
    .string()
    .trim()
    .min(1, { error: msg ?? 'Required!' })

// Validate UUID (Actually we' re not using UUID, but leave it for backward compatibility)
const isValidUuid = (uuid: string) => /^[a-zA-Z0-9]+$/.test(uuid)

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // 4mb

const limiter = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES,
  onError: () => {
    return new Response('Body too large 😅', { status: 413 })
  },
})

// The password routes carry a uuid, a password and an auth key, well under 1 KB. Without a cap Bun accepts 128 MB, and
// the SDK's v1 key derivation runs its pure-JS MD5 over the whole password on the event loop
const passwordLimiter = bodyLimit({
  maxSize: 16 * 1024,
  onError: () => {
    return new Response('Body too large 😅', { status: 413 })
  },
})

/** What `unzipSync` throws once its output passes `maxOutputLength`. */
function isTooLarge(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ERR_BUFFER_TOO_LARGE'
}

const app = new Hono()

app.use('/update', cors())
app.use('/remove', cors())
app.use('/get/:uuid', cors())

app.all('/', c => {
  return c.text(`LAPLACE Login Sync Server`)
})

app.post('/update', limiter, async c => {
  try {
    const body = await c.req.arrayBuffer()
    // `bodyLimit` caps the compressed body; without a cap here too, gzip's ratio does the rest — a few MB of zeros
    // inflates to gigabytes, synchronously, stalling every other request while it allocates. This cap can't just equal
    // `bodyLimit`, though: base64 spends 8 bits on every 6 of ciphertext, so gzip shrinks a real upload to about 3/4 of
    // its size, and a body just under the limit inflates to 5.3 MB. Twice the limit admits every upload `bodyLimit`
    // does. Over the cap, `unzipSync` throws and the handler answers 413 below
    const raw = unzipSync(body, { maxOutputLength: 2 * MAX_UPLOAD_BYTES })
    const decoder = new TextDecoder()
    const text = decoder.decode(raw)
    const json: CookieRequestBody = JSON.parse(text)
    const { uuid, encrypted } = json

    if (!encrypted || !uuid) {
      return c.json({ code: 400, message: 'Request body error' }, 400)
    }

    if (!isValidUuid(uuid)) {
      return c.json({ code: 400, message: 'Invalid data format' }, 400)
    }

    const filePath = `${dataDir}/${uuid}.json`
    const content = JSON.stringify({ encrypted })

    await Bun.write(filePath, content)
    const savedContent = await Bun.file(filePath).text()

    if (savedContent === content) {
      return c.json({ action: 'done' })
    } else {
      return c.json({ action: 'error' })
    }
  } catch (err) {
    // An upload that inflated past the cap isn't a malformed body, and logging it as one sends whoever investigates a
    // resource spike looking for a broken client
    if (isTooLarge(err)) {
      console.error('Rejected an upload that inflated past the size cap', err)
      return c.json({ code: 413, message: 'Body too large' }, 413)
    }
    console.error('Error parsing JSON:', err)
    return c.json({ code: 400, message: 'Error parsing body' }, 400)
  }
})

const removeSchema = z.object({
  uuid: z.string(),
  token: z.string(),
})

app.post('/remove', passwordLimiter, zValidator('form', removeSchema), async c => {
  const body = c.req.valid('form')
  const uuid = body.uuid
  const token = body.token

  if (!isValidUuid(uuid)) {
    return c.json({ code: 400, message: 'Invalid data format' }, 400)
  }

  try {
    const filePath = `${dataDir}/${uuid}.json`
    const file = Bun.file(filePath)

    if (!(await file.exists())) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    }

    const data = JSON.parse(await file.text())

    if (!data) {
      return c.json({ code: 500, message: 'Internal server error' }, 500)
    }

    try {
      // Resolves only for a payload with `cookie_data`, the proof of the password this route requires
      await decrypt(data.encrypted, { uuid, password: token })
    } catch (error) {
      // Only a token that can't open the blob is the caller's mistake. A blob this server can't read, such as one in a
      // newer protocol version, falls through to the error below instead of telling its owner the token is wrong
      if (isLoginSyncError(error, 'bad_credentials') || isLoginSyncError(error, 'invalid_token')) {
        return c.json({ code: 403, message: 'Invalid credentials' })
      }
      throw error
    }
    await unlink(filePath)
    return c.json({ code: 200, message: 'Done' })
  } catch (error) {
    console.error('Error removing credentials', error)
    return c.json({ code: 500, message: 'Error removing credentials' })
  }
})

app.get(
  '/get/:uuid',
  validator('query', (value, c) => {
    const parsed = z
      .object({
        auth: zStringNotEmpty().optional(),
      })
      .safeParse(value)

    if (!parsed.success) {
      return c.text('Invalid auth!', 401)
    }
    return parsed.data
  }),
  async c => {
    const query = c.req.valid('query')
    const uuid = c.req.param('uuid')
    const authToken = query.auth

    if (authKey !== undefined && (!authToken || !timingSafeEqual(authKey, authToken))) {
      return c.json({ code: 403, message: 'Unauthorized' }, 403)
    }

    if (!uuid || !isValidUuid(uuid)) {
      return c.json({ code: 400, message: 'Bad request' }, 400)
    }

    const filePath = `${dataDir}/${uuid}.json`

    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    }

    const data = JSON.parse(await file.text())

    // This condition is requied because we need to validate `data` first to avoid malformed content
    if (!data) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    } else {
      return c.json(data, 200, {
        'Cache-Control': 'private, max-age=5',
      })
    }
  }
)

app.post(
  '/get/:uuid',
  passwordLimiter,
  validator('json', (value, c) => {
    const parsed = z
      .object({
        password: zStringNotEmpty().optional(),
        auth: zStringNotEmpty().optional(),
      })
      .safeParse(value)

    if (!parsed.success) {
      return c.text('Invalid form!', 401)
    }
    return parsed.data
  }),
  async c => {
    const form = c.req.valid('json')
    const uuid = c.req.param('uuid')
    const authToken = form.auth

    if (authKey !== undefined && (!authToken || !timingSafeEqual(authKey, authToken))) {
      return c.json({ code: 403, message: 'Unauthorized' }, 403)
    }

    if (!uuid || !isValidUuid(uuid)) {
      return c.json({ code: 400, message: 'Bad request' }, 400)
    }

    const filePath = `${dataDir}/${uuid}.json`

    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    }

    const data = JSON.parse(await file.text())

    // This condition is requied because we need to validate `data` first to avoid malformed content
    if (!data) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    }

    const password = form.password
    if (!password) {
      return c.json(data)
    }

    try {
      const { payload } = await decrypt(data.encrypted, { uuid, password })
      return c.json(payload)
    } catch (error) {
      // A wrong password is the caller's mistake, not a server error
      if (isLoginSyncError(error, 'bad_credentials')) {
        return c.json({ code: 403, message: 'Invalid credentials' }, 403)
      }
      throw error
    }
  }
)

app.onError((err, c) => {
  console.error('Server error', err)
  return c.json({ code: 500, message: 'Server error' }, 500)
})

export default {
  port,
  fetch: app.fetch,
}
