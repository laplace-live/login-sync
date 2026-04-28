import { useCallback, useEffect, useState } from 'react'
import shortUid from 'short-uuid'

import type { ConfigProps } from './types'

import { DEFAULT_SYNC_SERVER, STORAGE_KEY_CONFIG } from './const'
import { sendSync } from './messaging'
import { loadData, saveData } from './storage'

export type SyncStatus = 'loading' | 'idle' | 'saving' | 'syncing'

/**
 * Build a fresh default config with newly-generated uuid/password.
 * Pure factory so callers (initial state, reset) get independent values.
 */
export function getDefaultConfig(): ConfigProps {
  return {
    endpoint: DEFAULT_SYNC_SERVER,
    password: String(shortUid.generate()),
    interval: 2,
    // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
    // This setting does not have any effect, keep it for compatibility
    domains: 'bilibili.com',
    uuid: String(shortUid.generate()),
    type: 'up',
    keep_live: '',
    blacklist: 'google.com',
    headers: '',
    forceUpdate: false,
    sync_laplace_live: false,
  }
}

export function validateConfig(c: ConfigProps): string | null {
  if (!c.endpoint || !c.password || !c.uuid || !c.type) return '请填写完整的信息'
  return null
}

/**
 * Owns the sync config lifecycle: load → edit → persist → push.
 * UI components only need to render `config`/`status` and call the actions.
 */
export function useSyncConfig() {
  const [config, setConfig] = useState<ConfigProps>(getDefaultConfig)
  const [status, setStatus] = useState<SyncStatus>('loading')
  // Tracks whether `config` reflects something the user has persisted at least
  // once. Drives the "not initialized yet" warning in a way that survives
  // re-renders (the previous `data.uuid === init.uuid` check did not).
  const [isPersisted, setIsPersisted] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadData(STORAGE_KEY_CONFIG).then((stored: ConfigProps | null) => {
      if (cancelled) return
      if (stored) {
        setConfig(prev => ({ ...prev, ...stored }))
        setIsPersisted(true)
      }
      setStatus('idle')
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback(async (next: ConfigProps) => {
    const error = validateConfig(next)
    if (error) throw new Error(error)
    setStatus('saving')
    try {
      await saveData(STORAGE_KEY_CONFIG, next)
      setConfig(next)
      setIsPersisted(true)
    } finally {
      setStatus('idle')
    }
  }, [])

  const sync = useCallback(async () => {
    if (config.type === 'pause') throw new Error('暂停状态不能同步')
    const error = validateConfig(config)
    if (error) throw new Error(error)

    setStatus('syncing')
    try {
      const ret = await sendSync({
        type: 'config',
        payload: { ...config, forceUpdate: true },
      })
      if (!ret || ret.message !== 'done') {
        throw new Error(ret?.note ?? '请检查填写的信息是否正确')
      }
      return ret
    } finally {
      setStatus('idle')
    }
  }, [config])

  // Wipes back to factory defaults AND persists, so the next popup open and
  // the background alarm both see the cleared state.
  const reset = useCallback(() => save(getDefaultConfig()), [save])

  return {
    config,
    setConfig,
    save,
    sync,
    reset,
    status,
    isPersisted,
  }
}
