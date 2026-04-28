export async function browserSet(key: string, value: string) {
  return await browser.storage.local.set({
    [key]: value,
  })
}

export async function browserGet(key: string) {
  const result = await browser.storage.local.get(key)
  if (result[key] === undefined) return null
  else return result[key]
}

export async function browserRemove(key: string) {
  return await browser.storage.local.remove(key)
}

export async function browserLoadAll(prefix: string | null = null): Promise<Record<string, unknown>> {
  const result = await browser.storage.local.get(null)
  let ret: Record<string, unknown> = result
  if (prefix) {
    ret = {}
    for (const key in result) {
      if (key.startsWith(prefix)) {
        if (typeof result[key] === 'string') {
          ret[key.substring(prefix.length)] = JSON.parse(result[key]) ?? result[key]
        } else {
          ret[key.substring(prefix.length)] = result[key]
        }
      }
    }
  }
  return ret
}

export async function loadData(key: string) {
  const data = browser?.storage ? await browserGet(key) : window.localStorage.getItem(key)
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch {
    return data || []
  }
}

export async function removeData(key: string) {
  const ret = browser?.storage ? await browserRemove(key) : window.localStorage.removeItem(key)
  return ret
}

export async function saveData(key: string, data: string | object) {
  const ret = browser?.storage
    ? await browserSet(key, JSON.stringify(data))
    : window.localStorage.setItem(key, JSON.stringify(data))
  return ret
}
