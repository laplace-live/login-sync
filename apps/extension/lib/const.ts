import type { ProtocolVersion } from '@laplace.live/login-sync'

import type { DomainConfig } from './types'

export const DEFAULT_SYNC_SERVER = 'https://login-sync.laplace.cn'

/**
 * The protocol version uploads are written in. Readers can only open versions they already know, so raising this is a
 * rollout: every reader must open the new version before any extension writes it. v2 needs `@laplace.live/login-sync`
 * 1.1.0 or later; 1.0.0 implements an earlier v2 and can't open these blobs. See its PROTOCOL.md.
 */
export const PAYLOAD_VERSION: ProtocolVersion = 2

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
