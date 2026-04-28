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
  // True when the in-memory `config` represents user-configured state — i.e.
  // loaded from storage on startup, explicitly saved by the user, or restored
  // from a snapshot. False when the user is looking at freshly-generated
  // defaults (fresh install, or right after a reset). Drives the
  // "not initialized" warning.
  //
  // NOTE: this is intentionally distinct from "did `saveData` succeed?" —
  // `reset()` calls `saveData` to write defaults but the result is NOT
  // user-configured, so the warning still needs to show.
  const [isConfigured, setIsConfigured] = useState(false)
  const [previousConfig, setPreviousConfig] = useState<PreviousConfig | null>(null)
  // Gate to prevent a double-Reset from overwriting the recovery snapshot
  // with the just-generated defaults. Flips back on after a real save.
  const [canStash, setCanStash] = useState(false)
  // Non-null when reading storage failed at startup. UI surfaces this so the
  // user knows the displayed defaults may not match what's actually persisted
  // (and won't blindly Save over good data).
  const [loadError, setLoadError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [stored, prev] = (await Promise.all([
          loadData(STORAGE_KEY_CONFIG),
          loadData(STORAGE_KEY_CONFIG_PREVIOUS),
        ])) as [ConfigProps | null, PreviousConfig | null]
        if (cancelled) return
        if (stored) {
          setConfig(c => ({ ...c, ...stored }))
          setIsConfigured(true)
          setCanStash(true)
        }
        if (prev?.config) setPreviousConfig(prev)
      } catch (err) {
        console.error('[laplace] failed to load stored config', err)
        if (!cancelled) setLoadError(err instanceof Error ? err : new Error(String(err)))
      } finally {
        // Always release the loading gate, otherwise the popup would freeze
        // permanently with every button disabled and no error feedback.
        if (!cancelled) setStatus('idle')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Internal write — overwrites the current config slot in storage. Does NOT
   * touch `isConfigured` or `canStash`; the high-level callers (`save`,
   * `reset`, `restorePrevious`) decide what the new config means semantically.
   * Conflating "wrote to storage" with "user-configured" is what caused the
   * "notInitialized" warning to silently disappear after a reset.
   */
  const persist = useCallback(async (next: ConfigProps) => {
    const error = validateConfig(next)
    if (error) throw new Error(error)
    setStatus('saving')
    try {
      await saveData(STORAGE_KEY_CONFIG, next)
      setConfig(next)
    } finally {
      setStatus('idle')
    }
  }, [])

  const save = useCallback(
    async (next: ConfigProps) => {
      await persist(next)
      // An explicit save means the config is now user-configured and worth
      // snapshotting on the next reset.
      setIsConfigured(true)
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
   * Writes `snap` back as the active config and clears the recovery slot.
   * Shared between `restorePrevious` (state-driven, used by the standalone
   * Restore button) and the undo callback returned by `reset()` (snapshot-
   * captured, used by the immediate post-reset toast).
   */
  const applyRestore = useCallback(
    async (snap: PreviousConfig) => {
      await persist(snap.config)
      await removeData(STORAGE_KEY_CONFIG_PREVIOUS)
      setPreviousConfig(null)
      setIsConfigured(true)
      setCanStash(true)
    },
    [persist]
  )

  /**
   * Snapshots the current config (uuid/password etc.) into the recovery
   * slot, then writes factory defaults. Only stashes when there's something
   * meaningful to preserve and the recovery slot hasn't already captured it.
   *
   * Sets `isConfigured = false` because the post-reset config is throwaway
   * defaults — the user needs to re-Save before the credentials are real.
   *
   * Returns an `undo` function that closes over the snapshot just captured
   * (or `null` if nothing was stashed). The caller — typically a toast
   * "Undo" action — should use this rather than calling `restorePrevious()`,
   * because at the moment `reset()` resolves React has not yet re-rendered
   * with the new `previousConfig`. Any closure capturing `restorePrevious`
   * here would still see `previousConfig === null` and throw.
   */
  const reset = useCallback(async (): Promise<(() => Promise<void>) | null> => {
    let snapshot: PreviousConfig | null = null
    if (canStash && isConfigured) {
      snapshot = { config, savedAt: Date.now() }
      await saveData(STORAGE_KEY_CONFIG_PREVIOUS, snapshot)
      setPreviousConfig(snapshot)
    }
    await persist(getDefaultConfig())
    setIsConfigured(false)
    setCanStash(false)

    if (!snapshot) return null
    const captured = snapshot
    return () => applyRestore(captured)
  }, [applyRestore, canStash, config, isConfigured, persist])

  /**
   * Restores the snapshot taken by the most recent `reset()` and clears it.
   * Reads `previousConfig` from state, so this is intended for UI rendered
   * AFTER the post-reset re-render (the standalone "Restore Previous"
   * button). For the immediate post-reset toast Undo, use the callback
   * returned by `reset()` instead — it closes over the captured snapshot
   * and isn't subject to render-timing closures.
   *
   * The restored config is the user's real previous credentials, so the next
   * reset must be allowed to snapshot it again (`canStash = true`) — otherwise
   * a Reset → Restore → Reset sequence would silently drop the snapshot and
   * leave the user with no way back.
   */
  const restorePrevious = useCallback(async () => {
    if (!previousConfig) throw new Error('没有可恢复的密钥')
    await applyRestore(previousConfig)
  }, [applyRestore, previousConfig])

  return {
    config,
    setConfig,
    save,
    sync,
    reset,
    restorePrevious,
    status,
    isConfigured,
    previousConfig,
    loadError,
  }
}
