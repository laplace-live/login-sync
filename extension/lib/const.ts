import type { DomainConfig } from './types'

export const DEFAULT_SYNC_SERVER = 'https://login-sync.laplace.cn'

export const STORAGE_KEY_CONFIG = 'COOKIE_SYNC_SETTING'

/**
 * Snapshot of the user's config taken right before a destructive Reset, so
 * the user can recover the previous uuid/password if they reset by accident.
 */
export const STORAGE_KEY_CONFIG_PREVIOUS = 'COOKIE_SYNC_SETTING_PREVIOUS'

/** Tracks the hash + timestamp of the most recently uploaded payload (for dedupe). */
export const STORAGE_KEY_LAST_UPLOAD = 'LAST_UPLOADED_COOKIE'

/** Prefix under which content scripts mirror per-host localStorage snapshots. */
export const STORAGE_KEY_LS_PREFIX = 'LS-'

/** Skip re-uploading an identical payload within this window (ms). */
export const SYNC_DEDUPE_WINDOW_MS = 20 * 60 * 1000

export const STATIC_DOMAINS: DomainConfig[] = [
  {
    domain: 'bilibili.com',
    localStorage: false,
  },
  {
    domain: 'laplace.live',
    localStorage: true,
  },
]
