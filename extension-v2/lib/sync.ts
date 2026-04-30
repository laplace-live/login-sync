import CryptoJS from 'crypto-js'
import { gzip } from 'pako'

import type { ConfigProps, DomainConfig } from './types'

import {
  DEFAULT_SYNC_SERVER,
  STATIC_DOMAINS,
  STORAGE_KEY_LAST_UPLOAD,
  STORAGE_KEY_LS_PREFIX,
  SYNC_DEDUPE_WINDOW_MS,
} from './const'
import { browserLoadAll, loadData, saveData } from './storage'

type Cookie = Browser.cookies.Cookie

/** Normalised result returned to background/UI callers. */
export type SyncResult = { action: string; note?: string }

interface LastUploadInfo {
  timestamp?: number
  sha256?: string
}

const LAPLACE_DOMAIN = 'laplace.live'
/** Only laplace.live localStorage keys with this prefix are synced. */
const LAPLACE_LS_KEY_PREFIX = 'loginSyncOption'

export async function uploadCookie(payload: ConfigProps): Promise<SyncResult> {
  if (!payload.uuid || !payload.password) {
    console.warn('[laplace] missing uuid/password')
    showBadge('err')
    return { action: 'fail', note: '错误的参数' }
  }

  let extraHeaders: Record<string, string>
  try {
    extraHeaders = parseExtraHeaders(payload.headers)
  } catch (error) {
    console.error('[laplace] header processing failed', error)
    showBadge('err')
    return { action: 'fail', note: '请求头解析失败' }
  }

  // NOTE: as a fork of the original code, we don't use the `domains` field — pull from STATIC_DOMAINS.
  const domains = STATIC_DOMAINS.map(c => c.domain)
  const blacklist = splitLines(payload.blacklist)
  const cookies = await getCookieByDomains(domains, blacklist)
  const localStorages = await getLocalStorageByDomains(STATIC_DOMAINS)

  // NOTE: server contract — these snake_case keys are decrypted and parsed by the sync server.
  const dataToEncrypt = JSON.stringify({
    cookie_data: cookies,
    local_storage_data: localStorages,
  })

  const endpoint = `${DEFAULT_SYNC_SERVER}/update`
  const sha256 = CryptoJS.SHA256(`${payload.uuid}-${payload.password}-${endpoint}-${dataToEncrypt}`).toString()

  console.log('[laplace] upload payload', {
    cookieDomains: Object.keys(cookies),
    cookieCount: Object.values(cookies).reduce((acc, curr) => acc + curr.length, 0),
    localStorageDomains: Object.keys(localStorages),
    localStorageKeyCount: Object.values(localStorages).reduce((acc, curr) => acc + Object.keys(curr).length, 0),
    sizeKb: Math.round(dataToEncrypt.length / 1024),
  })

  const lastUploaded: LastUploadInfo | null = await loadData(STORAGE_KEY_LAST_UPLOAD)
  console.debug('[laplace] payload hash', { sha256, lastTs: lastUploaded?.timestamp })

  if (!payload.forceUpdate && isFreshDuplicate(lastUploaded, sha256)) {
    console.log('[laplace] skip: identical payload within window')
    return { action: 'done', note: '本地 Cookie 数据无变动，不再上传' }
  }

  const aesKey = CryptoJS.MD5(`${payload.uuid}-${payload.password}`).toString().substring(0, 16)
  const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, aesKey).toString()

  try {
    showBadge('↑', 'green')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
        ...extraHeaders,
      },
      body: gzip(JSON.stringify({ uuid: payload.uuid, encrypted })),
    })

    const result = (await response.json()) as SyncResult | undefined
    if (result?.action === 'done') {
      await saveData(STORAGE_KEY_LAST_UPLOAD, { timestamp: Date.now(), sha256 })
    }
    return result ?? { action: 'fail' }
  } catch (error) {
    console.error('[laplace] upload failed', error)
    showBadge('err')
    return { action: 'fail', note: '网络请求失败' }
  }
}

function isFreshDuplicate(last: LastUploadInfo | null | undefined, sha256: string): boolean {
  if (!last || last.sha256 !== sha256) return false
  // In dev mode the stored entry can lack `timestamp`; treat that as "just uploaded"
  // to preserve the original skip-on-dupe behaviour.
  const ts = last.timestamp ?? Date.now()
  return Date.now() - ts < SYNC_DEDUPE_WINDOW_MS
}

function splitLines(input: string | undefined): string[] {
  const trimmed = input?.trim()
  return trimmed ? trimmed.split('\n') : []
}

function parseExtraHeaders(input: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of splitLines(input)) {
    // Split on the first colon so values containing ':' (e.g. `Bearer abc:xyz`) survive intact.
    const idx = line.indexOf(':')
    if (idx <= 0) {
      console.warn('[laplace] header parse failed', line)
      showBadge('fail', 'orange')
      continue
    }
    const name = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (name && value) out[name] = value
  }
  return out
}

export async function getLocalStorageByDomains(
  domainConfigs: DomainConfig[] = []
): Promise<Record<string, Record<string, unknown>>> {
  const ret: Record<string, Record<string, unknown>> = {}
  if (!domainConfigs.length) return ret

  const localStorages = await browserLoadAll(STORAGE_KEY_LS_PREFIX)
  for (const { domain, localStorage: enabled } of domainConfigs) {
    if (!enabled) continue

    for (const key in localStorages) {
      if (!key.includes(domain)) continue
      const data = localStorages[key]
      if (!isRecord(data)) continue

      if (domain === LAPLACE_DOMAIN) {
        const filtered = pickByKey(data, k => k.startsWith(LAPLACE_LS_KEY_PREFIX))
        if (Object.keys(filtered).length > 0) {
          console.debug('[laplace] localStorage matched (whitelisted)', {
            domain,
            count: Object.keys(filtered).length,
          })
          ret[key] = filtered
        }
      } else {
        console.debug('[laplace] localStorage matched', { domain, key })
        ret[key] = data
      }
    }
  }
  return ret
}

async function getCookieByDomains(domains: string[] = [], blacklist: string[] = []): Promise<Record<string, Cookie[]>> {
  const ret: Record<string, Cookie[]> = {}
  if (!browser.cookies) return ret

  let cookies: Cookie[]
  try {
    cookies = await browser.cookies.getAll({ partitionKey: {} })
  } catch {
    cookies = await browser.cookies.getAll({})
  }

  if (domains.length > 0) {
    for (const domain of domains) {
      ret[domain] = cookies.filter(c => c.domain?.includes(domain))
    }
    return ret
  }

  console.debug('[laplace] no domain filter, collecting all cookies')
  for (const cookie of cookies) {
    const cookieDomain = cookie.domain
    if (!cookieDomain) continue
    const blocked = blacklist.find(b => cookieDomain.includes(b))
    if (blocked) {
      console.debug('[laplace] cookie blacklisted', { domain: cookieDomain, match: blocked })
      continue
    }
    if (!ret[cookieDomain]) ret[cookieDomain] = []
    ret[cookieDomain].push(cookie)
  }
  return ret
}

function pickByKey(source: Record<string, unknown>, predicate: (key: string) => boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key in source) {
    if (predicate(key)) out[key] = source[key]
  }
  return out
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Toolbar action API differs by manifest version: MV3 exposes `browser.action`
 * while MV2 (which WXT still defaults to for Firefox) exposes `browser.browserAction`.
 * Pick whichever exists so the same code works in both targets.
 */
const actionApi = browser.action ?? browser.browserAction

export function showBadge(text: string, color = 'red', delay = 1000) {
  if (!actionApi) {
    console.warn('[laplace] showBadge: no action API available')
    return
  }

  actionApi.setBadgeText({ text })
  // `setBadgeTextColor` is MV3-only on Chromium and Firefox >= 63; guard so
  // older Firefox MV2 builds that lack it don't crash the whole upload path.
  actionApi.setBadgeTextColor?.({ color: [255, 255, 255, 255] })
  actionApi.setBadgeBackgroundColor({ color })
  setTimeout(() => {
    actionApi.setBadgeText({ text: '' })
  }, delay)
}
