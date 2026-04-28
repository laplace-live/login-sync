import type { DomainConfig } from './types'

export const DEFAULT_SYNC_SERVER = 'https://login-sync.laplace.cn'

export const STORAGE_KEY_CONFIG = 'COOKIE_SYNC_SETTING'

/**
 * Snapshot of the user's config taken right before a destructive Reset, so
 * the user can recover the previous uuid/password if they reset by accident.
 */
export const STORAGE_KEY_CONFIG_PREVIOUS = 'COOKIE_SYNC_SETTING_PREVIOUS'

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
