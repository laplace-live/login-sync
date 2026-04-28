import { useCallback, useEffect, useState } from 'react'
import shortUid from 'short-uuid'

import type { ConfigProps } from './types'

import { DEFAULT_SYNC_SERVER, STORAGE_KEY_CONFIG, STORAGE_KEY_CONFIG_PREVIOUS } from './const'
import { sendSync } from './messaging'
import { loadData, removeData, saveData } from './storage'

export type SyncStatus = 'loading' | 'idle' | 'saving' | 'syncing'

/**
 * A snapshot of the user's previous config, captured right before a Reset.
 * Used to power the "restore previous credentials" recovery path.
 */
export interface PreviousConfig {
  config: ConfigProps
  savedAt: number
}

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
  const [previousConfig, setPreviousConfig] = useState<PreviousConfig | null>(null)
  // Gate to prevent a double-Reset from overwriting the recovery snapshot
  // with the just-generated defaults. Flips back on after a real save.
  const [canStash, setCanStash] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      loadData(STORAGE_KEY_CONFIG) as Promise<ConfigProps | null>,
      loadData(STORAGE_KEY_CONFIG_PREVIOUS) as Promise<PreviousConfig | null>,
    ]).then(([stored, prev]) => {
      if (cancelled) return
      if (stored) {
        setConfig(c => ({ ...c, ...stored }))
        setIsPersisted(true)
        setCanStash(true)
      }
      if (prev?.config) setPreviousConfig(prev)
      setStatus('idle')
    })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Internal write — always overwrites the current config slot. Does not
   * touch `canStash` so callers (`save`, `reset`, `restorePrevious`) can
   * decide whether the next reset should snapshot.
   */
  const persist = useCallback(async (next: ConfigProps) => {
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

  const save = useCallback(
    async (next: ConfigProps) => {
      await persist(next)
      // A normal save means the current config is "fresh content" — the next
      // reset should snapshot it for recovery.
      setCanStash(true)
    },
    [persist]
  )

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

  /**
   * Snapshots the current config (uuid/password etc.) into the recovery
   * slot, then writes factory defaults. Only stashes when there's something
   * meaningful to preserve and the recovery slot hasn't already captured it.
   */
  const reset = useCallback(async () => {
    if (canStash && isPersisted) {
      const snapshot: PreviousConfig = { config, savedAt: Date.now() }
      await saveData(STORAGE_KEY_CONFIG_PREVIOUS, snapshot)
      setPreviousConfig(snapshot)
    }
    await persist(getDefaultConfig())
    setCanStash(false)
  }, [canStash, config, isPersisted, persist])

  /**
   * Restores the snapshot taken by the most recent `reset()` and clears it.
   * After restoring, the next reset is gated again until the user makes a
   * real save, so accidental re-resets don't lose the just-restored config.
   */
  const restorePrevious = useCallback(async () => {
    if (!previousConfig) throw new Error('没有可恢复的密钥')
    await persist(previousConfig.config)
    await removeData(STORAGE_KEY_CONFIG_PREVIOUS)
    setPreviousConfig(null)
    setCanStash(false)
  }, [persist, previousConfig])

  return {
    config,
    setConfig,
    save,
    sync,
    reset,
    restorePrevious,
    status,
    isPersisted,
    previousConfig,
  }
}
