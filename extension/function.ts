import CryptoJS from 'crypto-js'
import { gzip } from 'pako'
import browser from 'webextension-polyfill'

import { DEFAULT_SYNC_SERVER, STATIC_DOMAINS } from '~const'
import type { ConfigProps, DomainConfig } from '~types'

function is_firefox() {
  return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
}

function is_safari() {
  return navigator.userAgent.toLowerCase().indexOf('safari') > -1
}

export async function browser_set(key: string, value: string) {
  return await browser.storage.local.set({
    [key]: value
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
  let ret = result
  // 只返回以prefix开头的key对应的属性
  if (prefix) {
    ret = {}
    for (let key in result) {
      if (key.startsWith(prefix)) {
        // remove prefix from key
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
  // console.log("load",key,data);
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
  // chrome.storage.local.set({key:JSON.stringify(data)});
  const ret = browser?.storage
    ? await browser_set(key, JSON.stringify(data))
    : window.localStorage.setItem(key, JSON.stringify(data))
  return ret
}

export async function upload_cookie(payload: ConfigProps) {
  const { uuid, password } = payload
  // console.log(payload)
  // none of the fields can be empty
  if (!password || !uuid) {
    alert('错误的参数')
    showBadge('err')
    return false
  }

  // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
  // const domains = payload['domains']?.trim().length > 0 ? payload['domains']?.trim().split('\n') : []
  const domains = STATIC_DOMAINS.map((config) => config.domain)

  const blacklist = payload['blacklist']?.trim().length > 0 ? payload['blacklist']?.trim().split('\n') : []

  const cookies = await get_cookie_by_domains(domains, blacklist)
  // console.log(`cookies`, cookies)

  // Get local storage data for domains where localStorage is enabled
  const local_storages = await get_local_storage_by_domains(STATIC_DOMAINS)

  let headers: {
    [key: string]: string
  } = {
    'Content-Type': 'application/json',
    'Content-Encoding': 'gzip'
  }
  // 添加鉴权的 header
  try {
    if (payload['headers']?.trim().length > 0) {
      let extraHeaderPairs = payload['headers']?.trim().split('\n')
      extraHeaderPairs.forEach((extraHeaderPair, index) => {
        let extraHeaderPairKV = String(extraHeaderPair).split(':')
        if (extraHeaderPairKV?.length > 1) {
          headers[extraHeaderPairKV[0]] = extraHeaderPairKV[1]
        } else {
          console.log('error', '解析 header 错误: ', extraHeaderPair)
          showBadge('fail', 'orange')
        }
      })
    }
  } catch (error) {
    console.log('error', error)
    showBadge('err')
    return false
  }
  // 用aes对cookie进行加密
  const the_key = CryptoJS.MD5(payload['uuid'] + '-' + payload['password'])
    .toString()
    .substring(0, 16)
  const data_to_encrypt = JSON.stringify({
    cookie_data: cookies,
    local_storage_data: local_storages
  })

  // Log detailed upload data
  console.log('[LAPLACE LOGIN SYNC] Data being uploaded:', {
    cookies_domains: Object.keys(cookies),
    cookies_count: Object.values(cookies).reduce((acc, curr) => acc + curr.length, 0),
    cookies_sample: Object.entries(cookies)
      .slice(0, 2)
      .map(([domain, cookies]) => ({ domain, count: cookies.length })),
    localStorage_domains: Object.keys(local_storages),
    localStorage_entries_count: Object.values(local_storages).reduce((acc, curr) => acc + Object.keys(curr).length, 0),
    total_data_size_kb: Math.round(data_to_encrypt.length / 1024)
  })

  const encrypted = CryptoJS.AES.encrypt(data_to_encrypt, the_key).toString()
  // const endpoint = payload['endpoint'].trim().replace(/\/+$/, '') + '/update'
  // Fixed endpoint, always use our builtin server
  const endpoint = DEFAULT_SYNC_SERVER + '/update'

  // get sha256 of the encrypted data
  const sha256 = CryptoJS.SHA256(uuid + '-' + password + '-' + endpoint + '-' + data_to_encrypt).toString()
  console.log('sha256', sha256)
  const last_uploaded_info = await load_data('LAST_UPLOADED_COOKIE')
  console.log(`last_uploaded_info.timestamp`, last_uploaded_info?.timestamp)

  // 如果 3 小时内已经上传过同样内容的数据，则不再上传
  if (
    !payload['forceUpdate'] &&
    last_uploaded_info &&
    last_uploaded_info.sha256 === sha256 &&
    // In some rare case (ie when extension loaded in development mode), the .timestamp can be undefined
    new Date().getTime() - (last_uploaded_info?.timestamp || new Date().getTime()) < 1000 * 60 * 60 * 1
  ) {
    console.log('same data in 1 hours, skip')
    return {
      action: 'done',
      note: '本地 Cookie 数据无变动，不再上传'
    }
  }

  const payload2 = {
    uuid: payload['uuid'],
    encrypted: encrypted
  }
  // console.log(endpoint, payload2)
  try {
    showBadge('↑', 'green')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: gzip(JSON.stringify(payload2))
    })
    const result = await response.json()

    if (result && result.action === 'done')
      await save_data('LAST_UPLOADED_COOKIE', {
        timestamp: new Date().getTime(),
        sha256: sha256
      })

    return result
  } catch (error) {
    console.log('error', error)
    showBadge('err')
    return false
  }
}

export async function get_local_storage_by_domains(domainConfigs: DomainConfig[] = []) {
  let ret_storage: { [key: string]: Record<string, any> } = {}
  const local_storages = await browser_load_all('LS-')

  if (Array.isArray(domainConfigs) && domainConfigs.length > 0) {
    for (const config of domainConfigs) {
      // Skip domains where localStorage is disabled
      if (!config.localStorage) continue

      const domain = config.domain
      for (const key in local_storages) {
        if (key.indexOf(domain) >= 0) {
          // For laplace.live domain, only include items where localStorage key starts with 'loginSyncOption'
          if (domain === 'laplace.live') {
            const storageData = local_storages[key]

            if (storageData && typeof storageData === 'object') {
              const filteredData: Record<string, any> = {}
              for (const storageKey in storageData) {
                if (storageKey.startsWith('loginSyncOption')) {
                  filteredData[storageKey] = storageData[storageKey]
                }
              }

              if (Object.keys(filteredData).length > 0) {
                console.log('domain matched with whitelist items', domain, Object.keys(filteredData).length)
                ret_storage[key] = filteredData
              }
            }
          } else {
            // For other domains, include all keys
            console.log('domain matched', domain, key)
            ret_storage[key] = local_storages[key]
          }
        }
      }
    }
  }
  return ret_storage
}

async function get_cookie_by_domains(domains: string[] = [], blacklist: string[] = []) {
  let ret_cookies: {
    [key: string]: browser.Cookies.Cookie[]
  } = {}
  // 获取cookie
  if (browser.cookies) {
    // Try with partitionKey first, fall back to empty options if not supported
    let cookies
    try {
      cookies = await browser.cookies.getAll({ partitionKey: {} })
    } catch (e) {
      cookies = await browser.cookies.getAll({})
    }

    if (Array.isArray(domains) && domains.length > 0) {
      // console.log('domains', domains)
      for (const domain of domains) {
        ret_cookies[domain] = []
        for (const cookie of cookies) {
          if (cookie.domain?.includes(domain)) {
            ret_cookies[domain].push(cookie)
          }
        }
      }
    } else {
      console.log('domains are empty')
      for (const cookie of cookies) {
        // console.log('the cookie', cookie)
        if (cookie.domain) {
          let in_blacklist = false
          for (const black of blacklist) {
            if (cookie.domain.includes(black)) {
              console.log('blacklist matched', cookie.domain, black)
              in_blacklist = true
            }
          }

          if (!in_blacklist) {
            if (!ret_cookies[cookie.domain]) {
              ret_cookies[cookie.domain] = []
            }
            ret_cookies[cookie.domain].push(cookie)
          }
        }
      }
    }
  }
  // console.log('ret_cookies', ret_cookies)
  return ret_cookies
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function showBadge(text: string, color = 'red', delay = 1000) {
  chrome.action.setBadgeText({
    text: text
  })
  chrome.action.setBadgeTextColor({
    color: [255, 255, 255, 255]
  })
  chrome.action.setBadgeBackgroundColor({
    color: color
  })
  setTimeout(() => {
    chrome.action.setBadgeText({
      text: ''
    })
  }, delay)
}
