import CryptoJS from 'crypto-js'
import { gzip } from 'pako'

import { DEFAULT_SYNC_SERVER, STATIC_DOMAINS } from './const'
import { browserLoadAll, loadData, saveData } from './storage'
import type { ConfigProps, DomainConfig } from './types'

type Cookie = Browser.cookies.Cookie

export async function uploadCookie(payload: ConfigProps) {
  const { uuid, password } = payload
  if (!password || !uuid) {
    alert('错误的参数')
    showBadge('err')
    return false
  }

  // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
  const domains = STATIC_DOMAINS.map((config) => config.domain)

  const blacklist =
    payload['blacklist']?.trim().length > 0 ? payload['blacklist']?.trim().split('\n') : []

  const cookies = await getCookieByDomains(domains, blacklist)

  // Get local storage data for domains where localStorage is enabled
  const localStorages = await getLocalStorageByDomains(STATIC_DOMAINS)

  const headers: {
    [key: string]: string
  } = {
    'Content-Type': 'application/json',
    'Content-Encoding': 'gzip',
  }
  // 添加鉴权的 header
  try {
    if (payload['headers']?.trim().length > 0) {
      const extraHeaderPairs = payload['headers']?.trim().split('\n')
      extraHeaderPairs.forEach((extraHeaderPair) => {
        const extraHeaderPairKV = String(extraHeaderPair).split(':')
        if (extraHeaderPairKV?.length > 1) {
          headers[extraHeaderPairKV[0]] = extraHeaderPairKV[1]
        } else {
          console.warn('[laplace] header parse failed', extraHeaderPair)
          showBadge('fail', 'orange')
        }
      })
    }
  } catch (error) {
    console.error('[laplace] header processing failed', error)
    showBadge('err')
    return false
  }
  // 用aes对cookie进行加密
  const aesKey = CryptoJS.MD5(payload['uuid'] + '-' + payload['password'])
    .toString()
    .substring(0, 16)
  // NOTE: server contract — these snake_case keys are decrypted and parsed by the sync server
  const dataToEncrypt = JSON.stringify({
    cookie_data: cookies,
    local_storage_data: localStorages,
  })

  console.log('[laplace] upload payload', {
    cookieDomains: Object.keys(cookies),
    cookieCount: Object.values(cookies).reduce((acc, curr) => acc + curr.length, 0),
    localStorageDomains: Object.keys(localStorages),
    localStorageKeyCount: Object.values(localStorages).reduce(
      (acc, curr) => acc + Object.keys(curr).length,
      0,
    ),
    sizeKb: Math.round(dataToEncrypt.length / 1024),
  })

  const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, aesKey).toString()
  // Fixed endpoint, always use our builtin server
  const endpoint = DEFAULT_SYNC_SERVER + '/update'

  const sha256 = CryptoJS.SHA256(
    uuid + '-' + password + '-' + endpoint + '-' + dataToEncrypt,
  ).toString()
  const lastUploadedInfo = await loadData('LAST_UPLOADED_COOKIE')
  console.debug('[laplace] payload hash', { sha256, lastTs: lastUploadedInfo?.timestamp })

  // 如果 20 分钟内已经上传过同样内容的数据，则不再上传
  if (
    !payload['forceUpdate'] &&
    lastUploadedInfo &&
    lastUploadedInfo.sha256 === sha256 &&
    // In some rare case (ie when extension loaded in development mode), the .timestamp can be undefined
    new Date().getTime() - (lastUploadedInfo?.timestamp || new Date().getTime()) < 1000 * 60 * 20
  ) {
    console.log('[laplace] skip: identical payload within 20 min')
    return {
      action: 'done',
      note: '本地 Cookie 数据无变动，不再上传',
    }
  }

  const requestBody = {
    uuid: payload['uuid'],
    encrypted: encrypted,
  }
  try {
    showBadge('↑', 'green')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: gzip(JSON.stringify(requestBody)),
    })
    const result = await response.json()

    if (result && result.action === 'done')
      await saveData('LAST_UPLOADED_COOKIE', {
        timestamp: new Date().getTime(),
        sha256: sha256,
      })

    return result
  } catch (error) {
    console.error('[laplace] upload failed', error)
    showBadge('err')
    return false
  }
}

export async function getLocalStorageByDomains(domainConfigs: DomainConfig[] = []) {
  const retStorage: { [key: string]: Record<string, any> } = {}
  const localStorages = await browserLoadAll('LS-')

  if (Array.isArray(domainConfigs) && domainConfigs.length > 0) {
    for (const config of domainConfigs) {
      if (!config.localStorage) continue

      const domain = config.domain
      for (const key in localStorages) {
        if (key.indexOf(domain) >= 0) {
          // For laplace.live domain, only include items where localStorage key starts with 'loginSyncOption'
          if (domain === 'laplace.live') {
            const storageData = localStorages[key]

            if (storageData && typeof storageData === 'object') {
              const filteredData: Record<string, any> = {}
              for (const storageKey in storageData) {
                if (storageKey.startsWith('loginSyncOption')) {
                  filteredData[storageKey] = storageData[storageKey]
                }
              }

              if (Object.keys(filteredData).length > 0) {
                console.debug('[laplace] localStorage matched (whitelisted)', {
                  domain,
                  count: Object.keys(filteredData).length,
                })
                retStorage[key] = filteredData
              }
            }
          } else {
            console.debug('[laplace] localStorage matched', { domain, key })
            retStorage[key] = localStorages[key]
          }
        }
      }
    }
  }
  return retStorage
}

async function getCookieByDomains(domains: string[] = [], blacklist: string[] = []) {
  const retCookies: {
    [key: string]: Cookie[]
  } = {}
  if (browser.cookies) {
    let cookies: Cookie[]
    try {
      cookies = await browser.cookies.getAll({ partitionKey: {} })
    } catch {
      cookies = await browser.cookies.getAll({})
    }

    if (Array.isArray(domains) && domains.length > 0) {
      for (const domain of domains) {
        retCookies[domain] = []
        for (const cookie of cookies) {
          if (cookie.domain?.includes(domain)) {
            retCookies[domain].push(cookie)
          }
        }
      }
    } else {
      console.debug('[laplace] no domain filter, collecting all cookies')
      for (const cookie of cookies) {
        if (cookie.domain) {
          let inBlacklist = false
          for (const black of blacklist) {
            if (cookie.domain.includes(black)) {
              console.debug('[laplace] cookie blacklisted', { domain: cookie.domain, match: black })
              inBlacklist = true
            }
          }

          if (!inBlacklist) {
            if (!retCookies[cookie.domain]) {
              retCookies[cookie.domain] = []
            }
            retCookies[cookie.domain].push(cookie)
          }
        }
      }
    }
  }
  return retCookies
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function showBadge(text: string, color = 'red', delay = 1000) {
  browser.action.setBadgeText({
    text: text,
  })
  browser.action.setBadgeTextColor({
    color: [255, 255, 255, 255],
  })
  browser.action.setBadgeBackgroundColor({
    color: color,
  })
  setTimeout(() => {
    browser.action.setBadgeText({
      text: '',
    })
  }, delay)
}
