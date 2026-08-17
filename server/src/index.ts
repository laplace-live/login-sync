import { unlink } from 'node:fs/promises'
import { unzipSync } from 'node:zlib'
import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { validator } from 'hono/validator'
import { z } from 'zod'

import { cryptoHash, decryptAes } from './lib/crypto'
import { timingSafeEqual } from './utils/timingSafeEqual'

interface CookieRequestBody {
  uuid: string
  encrypted: string
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8088
const useAuth = process.env.LAPLACE_LOGIN_SYNC_AUTH_MODE
const auth = process.env.LAPLACE_LOGIN_SYNC_AUTH_KEY

// this code is inside ./src, so we need to go one level up to access the data folder
const dataDir = `${import.meta.dir}/../data`

const zStringNotEmpty = (msg?: string) =>
  z
    .string()
    .trim()
    .min(1, { error: msg ?? 'Required!' })

// Validate UUID (Actually we' re not using UUID, but leave it for backward compatibility)
const isValidUuid = (uuid: string) => /^[a-zA-Z0-9]+$/.test(uuid)

const limiter = bodyLimit({
  maxSize: 4 * 1024 * 1024, // 4mb
  onError: () => {
    return new Response('Body too large 😅', { status: 413 })
  },
})

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
    const raw = unzipSync(body)
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
    console.error('Error parsing JSON:', err)
    return c.json({ code: 400, message: 'Error parsing body' }, 400)
  }
})

const removeSchema = z.object({
  uuid: z.string(),
  token: z.string(),
})

app.post('/remove', zValidator('form', removeSchema), async c => {
  const body = c.req.valid('form')
  const uuid = body.uuid
  const token = body.token

  if (!isValidUuid(uuid)) {
    return c.json({ code: 400, message: 'Invalid data format' }, 400)
  }

  try {
    const filePath = `${dataDir}/${uuid}.json`

    if (!(await Bun.file(filePath).exists())) {
      return c.json({ code: 403, message: 'Invalid credentials' }, 403)
    } else {
      const data = JSON.parse(await Bun.file(filePath).text())

      if (!data) {
        return c.json({ code: 500, message: 'Internal server error' }, 500)
      } else {
        try {
          const parsed = cookieCloudDecrypt(uuid, data.encrypted, token)

          if (typeof parsed === 'object' && 'cookie_data' in parsed) {
            await unlink(filePath)
            return c.json({ code: 200, message: 'Done' })
          } else {
            return c.json({ code: 403, message: 'Invalid credentials' })
          }
        } catch {
          return c.json({ code: 403, message: 'Invalid credentials' })
        }
      }
    }
  } catch {
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

    if (useAuth !== undefined && auth && (!authToken || !timingSafeEqual(auth, authToken))) {
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

    if (useAuth !== undefined && auth && (!authToken || !timingSafeEqual(auth, authToken))) {
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
      const password = form.password

      if (password && password !== '') {
        const parsed = cookieCloudDecrypt(uuid, data.encrypted, password)
        return c.json(parsed)
      } else {
        return c.json(data)
      }
    }
  }
)

app.onError((err, c) => {
  console.error('Server error', err)
  return c.json({ code: 500, message: 'Server error' }, 500)
})

function cookieCloudDecrypt(uuid: string, encrypted: string, password: string) {
  const key = cryptoHash(`${uuid}-${password}`, { algorithm: 'md5' }).substring(0, 16)
  // const decrypted = CryptoJS.AES.decrypt(encrypted, key).toString(CryptoJS.enc.Utf8)
  const decrypted = decryptAes(encrypted, key)
  const parsed = JSON.parse(decrypted)
  return parsed
}

export default {
  port,
  fetch: app.fetch,
}
