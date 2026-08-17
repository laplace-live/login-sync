import { unzipSync } from 'node:zlib'
import type { Context } from 'hono'

interface CookieRequestBody {
  uuid: string
  encrypted: string
}

export const Update = async (c: Context) => {
  const dataDir = `${import.meta.dir}/data`
  const body = await c.req.arrayBuffer()
  const raw = unzipSync(body)
  const decoder = new TextDecoder()
  const text = decoder.decode(raw)

  try {
    const json: CookieRequestBody = JSON.parse(text)
    const { uuid, encrypted } = json

    if (!encrypted || !uuid) {
      return c.json({ code: 400, message: 'Request body error' }, 400)
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
}
