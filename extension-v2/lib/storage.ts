export async function browser_set(key: string, value: string) {
  return await browser.storage.local.set({
    [key]: value,
  })
}

export async function browser_get(key: string) {
  const result = await browser.storage.local.get(key)
  if (result[key] === undefined) return null
  else return result[key]
}

export async function browser_remove(key: string) {
  return await browser.storage.local.remove(key)
}

export async function browser_load_all(prefix: string | null = null): Promise<Record<string, any>> {
  const result = await browser.storage.local.get(null)
  let ret: Record<string, any> = result
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

export async function load_data(key: string) {
  const data = browser?.storage ? await browser_get(key) : window.localStorage.getItem(key)
  try {
    return typeof data === 'string' ? JSON.parse(data) : data
  } catch (error) {
    return data || []
  }
}

export async function remove_data(key: string) {
  const ret = browser?.storage ? await browser_remove(key) : window.localStorage.removeItem(key)
  return ret
}

export async function save_data(key: string, data: string | object) {
  const ret = browser?.storage
    ? await browser_set(key, JSON.stringify(data))
    : window.localStorage.setItem(key, JSON.stringify(data))
  return ret
}
