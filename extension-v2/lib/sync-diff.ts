/**
 * Per-key fingerprinting and diff logging for the sync payload.
 *
 * This is observability scaffolding sitting *next to* the core upload path, not
 * part of it: it lets us answer "why did the dedupe hash change this cycle?"
 * by attributing the diff to a specific cookie name + field (value vs
 * expirationDate vs flags), so noisy/rotating cookies can be identified and
 * blacklisted upstream.
 *
 * Nothing here affects upload behaviour or the server contract — `sync.ts`
 * just calls `fingerprintCookies` / `fingerprintLocalStorage` / `logPayloadDiff`.
 */

import CryptoJS from 'crypto-js'

type Cookie = Browser.cookies.Cookie

/**
 * Per-cookie fingerprint entry. Splits the cookie into the bits that can
 * legitimately change between syncs so the diff can attribute mismatches to a
 * specific field (value vs expirationDate vs flags) instead of a generic
 * "changed" verdict.
 *
 * - `v`: short hash of `cookie.value` (12 hex chars).
 * - `e`: raw `expirationDate` (seconds since epoch). Omitted for session cookies.
 * - `m`: short hash of `secure | httpOnly | sameSite | session`. Omitted when
 *   all flags are at their defaults to keep stored payloads small.
 */
type CookieEntryFp = {
  v: string
  e?: number
  m?: string
}

/**
 * Per-cookie fingerprint, grouped by the cookie's actual domain. Inner values
 * may legacy-be plain strings (the v1 value-only hash) when reading data
 * written by an earlier extension build; `diffCookies` normalises on read so
 * no migration step is needed.
 */
export type CookieFingerprint = Record<string, Record<string, CookieEntryFp | string>>

/** Per-localStorage-entry fingerprint, grouped by storage key. */
export type LsFingerprint = Record<string, Record<string, string>>

/**
 * The shape `logPayloadDiff` wants to compare. `LastUploadInfo` in `sync.ts`
 * structurally satisfies `Partial<FingerprintSnapshot & { sha256: string }>`
 * so callers don't need to wrap or cast.
 */
export interface FingerprintSnapshot {
  cookieFp: CookieFingerprint
  localStorageFp: LsFingerprint
}

/** Both SHA256 values that drove the `hashChanged` decision, for log clarity. */
export interface HashContext {
  prev?: string
  curr: string
}

interface CookieDiff {
  /** Same key, different `value` hash. */
  valueChanged: string[]
  /** Same key + value, different `expirationDate` (with before/after for clarity). */
  expChanged: { key: string; from?: number; to?: number }[]
  /** Same key + value + exp, but `secure`/`httpOnly`/`sameSite`/`session` shifted. */
  metaChanged: string[]
  added: string[]
  removed: string[]
}

interface LsDiff {
  changed: string[]
  added: string[]
  removed: string[]
}

/**
 * Short value-hash used to spot per-key changes without persisting raw cookie
 * values. 12 hex chars (~48 bits) is plenty for change-detection collisions.
 */
function shortHash(value: string): string {
  return CryptoJS.SHA256(value).toString().slice(0, 12)
}

/** Disambiguate cookies that share a name across paths (rare but legal). */
function cookieEntryKey(c: Cookie): string {
  const path = c.path && c.path !== '/' ? ` path=${c.path}` : ''
  return `${c.name}${path}`
}

/** Pack the non-default flag fields into a deterministic string for hashing. */
function cookieMetaSig(c: Cookie): string {
  return `${c.secure ? 1 : 0}|${c.httpOnly ? 1 : 0}|${c.sameSite ?? ''}|${c.session ? 1 : 0}`
}

function fingerprintCookieEntry(c: Cookie): CookieEntryFp {
  const entry: CookieEntryFp = { v: shortHash(c.value ?? '') }
  if (typeof c.expirationDate === 'number') entry.e = c.expirationDate
  // Default flags (all false / no sameSite) → omit `m` to keep storage tight.
  const meta = cookieMetaSig(c)
  if (meta !== '0|0||0') entry.m = shortHash(meta)
  return entry
}

export function fingerprintCookies(cookies: Record<string, Cookie[]>): CookieFingerprint {
  const fp: CookieFingerprint = {}
  for (const list of Object.values(cookies)) {
    for (const c of list) {
      const group = c.domain || '(no-domain)'
      if (!fp[group]) fp[group] = {}
      fp[group][cookieEntryKey(c)] = fingerprintCookieEntry(c)
    }
  }
  return fp
}

export function fingerprintLocalStorage(ls: Record<string, Record<string, unknown>>): LsFingerprint {
  const fp: LsFingerprint = {}
  for (const [storageKey, entries] of Object.entries(ls)) {
    fp[storageKey] = {}
    for (const [k, v] of Object.entries(entries)) {
      // JSON.stringify is stable enough for change-detection on the structured
      // values content scripts mirror into extension storage.
      fp[storageKey][k] = shortHash(typeof v === 'string' ? v : JSON.stringify(v))
    }
  }
  return fp
}

/**
 * Tolerate v1 cookie fingerprints (plain string = value hash only) so users
 * upgrading from the previous build don't lose their dedupe baseline.
 */
function normalizeCookieEntry(entry: CookieEntryFp | string | undefined): CookieEntryFp | undefined {
  if (entry === undefined) return undefined
  return typeof entry === 'string' ? { v: entry } : entry
}

function diffCookies(prev: CookieFingerprint | undefined, curr: CookieFingerprint): CookieDiff {
  const valueChanged: string[] = []
  const expChanged: { key: string; from?: number; to?: number }[] = []
  const metaChanged: string[] = []
  const added: string[] = []
  const removed: string[] = []
  const groups = new Set([...Object.keys(prev ?? {}), ...Object.keys(curr)])
  for (const group of groups) {
    const p = prev?.[group] ?? {}
    const c = curr[group] ?? {}
    const keys = new Set([...Object.keys(p), ...Object.keys(c)])
    for (const k of keys) {
      const label = `${group}::${k}`
      const pe = normalizeCookieEntry(p[k])
      const ce = normalizeCookieEntry(c[k])
      if (!pe) {
        added.push(label)
        continue
      }
      if (!ce) {
        removed.push(label)
        continue
      }
      if (pe.v !== ce.v) {
        valueChanged.push(label)
        continue
      }
      // Value matched; report the *first* non-value discrepancy so a single
      // server-side cookie refresh doesn't get double-counted across categories.
      if (pe.e !== ce.e) {
        expChanged.push({ key: label, from: pe.e, to: ce.e })
        continue
      }
      if ((pe.m ?? '') !== (ce.m ?? '')) metaChanged.push(label)
    }
  }
  valueChanged.sort()
  metaChanged.sort()
  added.sort()
  removed.sort()
  expChanged.sort((a, b) => a.key.localeCompare(b.key))
  return { valueChanged, expChanged, metaChanged, added, removed }
}

function diffLs(prev: LsFingerprint | undefined, curr: LsFingerprint): LsDiff {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  const groups = new Set([...Object.keys(prev ?? {}), ...Object.keys(curr)])
  for (const group of groups) {
    const p = prev?.[group] ?? {}
    const c = curr[group] ?? {}
    const keys = new Set([...Object.keys(p), ...Object.keys(c)])
    for (const k of keys) {
      const label = `${group}::${k}`
      if (p[k] === undefined) added.push(label)
      else if (c[k] === undefined) removed.push(label)
      else if (p[k] !== c[k]) changed.push(label)
    }
  }
  changed.sort()
  added.sort()
  removed.sort()
  return { changed, added, removed }
}

/**
 * Logs why this upload is happening, decomposed by cookie / LS key when the
 * dedupe hash actually changed.
 *
 * Behaviour by case:
 *   - No previous fingerprint:      info — "first upload".
 *   - `hashChanged === false`:      info — "payload identical, periodic re-sync"
 *                                   (dedupe window expired, or `forceUpdate`).
 *   - `hashChanged === true` with   per-key diff in three categories so the
 *     real per-key changes:         cause is unambiguous:
 *     - `valueChanged`: actual `Set-Cookie` value rotation (analytics, marketing).
 *     - `expChanged`:   server-side sliding-expiry refresh (`expirationDate` only).
 *     - `metaChanged`:  `secure` / `httpOnly` / `sameSite` / `session` flag flip.
 *   - `hashChanged === true` but    warn — non-fingerprinted field shifted
 *     no per-key diff:              (cookie array order, `storeId`,
 *                                   `partitionKey`, `firstPartyDomain`, ...).
 *
 * `hashChanged` must be supplied by the caller because this module doesn't see
 * the whole-payload SHA256; treating "we got here at all" as a hash change
 * would otherwise produce phantom warnings on every window-expired re-upload
 * and every `forceUpdate` sync of unchanged data. `hashCtx` is logged inside
 * the warning so the developer can audit the `hashChanged` verdict in place.
 */
export function logPayloadDiff(
  prev: Partial<FingerprintSnapshot> | null | undefined,
  curr: FingerprintSnapshot,
  hashChanged: boolean,
  hashCtx?: HashContext
): void {
  if (!prev?.cookieFp && !prev?.localStorageFp) {
    console.log('[laplace] payload diff: no previous fingerprint, treating as first upload')
    return
  }

  if (!hashChanged) {
    console.log('[laplace] payload identical to last upload (re-syncing: dedupe window expired or force update)')
    return
  }

  const cookie = diffCookies(prev?.cookieFp, curr.cookieFp)
  const ls = diffLs(prev?.localStorageFp, curr.localStorageFp)
  const total =
    cookie.valueChanged.length +
    cookie.expChanged.length +
    cookie.metaChanged.length +
    cookie.added.length +
    cookie.removed.length +
    ls.changed.length +
    ls.added.length +
    ls.removed.length

  if (total === 0) {
    // Deep cookie fingerprint matches across value + exp + flags, yet the
    // whole-payload SHA still moved → the difference is in something we don't
    // (yet) fingerprint. Most likely candidates: cookie array order shift from
    // `getAll()` (sorted by creation time, which bumps on idempotent re-set),
    // or `storeId` / `firstPartyDomain` / `partitionKey` shape change.
    console.warn(
      '[laplace] payload hash changed but per-cookie deep fingerprint identical; check cookie array order or non-fingerprinted fields (storeId / partitionKey / firstPartyDomain)',
      hashCtx ?? '(no hashCtx supplied)'
    )
    return
  }

  console.log('[laplace] payload changed since last upload', {
    summary: {
      cookie: {
        valueChanged: cookie.valueChanged.length,
        expChanged: cookie.expChanged.length,
        metaChanged: cookie.metaChanged.length,
        added: cookie.added.length,
        removed: cookie.removed.length,
      },
      localStorage: { changed: ls.changed.length, added: ls.added.length, removed: ls.removed.length },
    },
    cookieValueChanged: cookie.valueChanged,
    cookieExpChanged: cookie.expChanged,
    cookieMetaChanged: cookie.metaChanged,
    cookieAdded: cookie.added,
    cookieRemoved: cookie.removed,
    lsChanged: ls.changed,
    lsAdded: ls.added,
    lsRemoved: ls.removed,
  })
}
