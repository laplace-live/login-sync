import type { SyncRequest, SyncResponse } from '@/lib/messaging'
import type { ConfigProps } from '@/lib/types'

import { STORAGE_KEY_CONFIG } from '@/lib/const'
import { loadData } from '@/lib/storage'
import { sleep, uploadCookie } from '@/lib/sync'

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install' || details.reason === 'update') {
      browser.alarms.create('bg_1_minute', {
        when: Date.now(),
        periodInMinutes: 1,
      })
    }
  })

  browser.alarms.onAlarm.addListener(async (a) => {
    if (a.name !== 'bg_1_minute') return

    const config: ConfigProps = await loadData(STORAGE_KEY_CONFIG)
    if (!config) return

    if (config.type && config.type === 'pause') {
      console.debug('[laplace] sync paused')
      return true
    }

    // 获得当前的分钟数
    const now = new Date()
    const minute = now.getMinutes()
    const hour = now.getHours()
    const day = now.getDate()
    // Total minutes from the begining of this month
    const minuteCount = (day * 24 + hour) * 60 + minute

    if (config.uuid) {
      // 如果时间间隔可以整除分钟数，则进行同步
      if (config.interval < 1 || minuteCount % config.interval === 0) {
        console.log('[laplace] sync tick', { minute: minuteCount, every: config.interval })
        const result = await uploadCookie(config)
        if (result && result['action'] === 'done') console.log('[laplace] upload ok')
        else console.warn('[laplace] upload not done', result)
      } else {
        console.debug('[laplace] sync skip (off-cycle)', {
          minute: minuteCount,
          every: config.interval,
        })
      }
    }

    if (config.keep_live) {
      // 按行分割，每行的格式为 url|interval
      const keepLiveLines = config.keep_live?.trim()?.split('\n')
      for (let i = 0; i < keepLiveLines.length; i++) {
        const line = keepLiveLines[i]
        const parts = line.split('|')
        const url = parts[0]
        const interval = parts[1] ? parseInt(parts[1]) : 60
        if (interval > 0 && minuteCount % interval === 0) {
          console.log('[laplace] keep-alive tick', { url, every: interval })

          // 查询是否已经打开目标页面，如果已经打开，则不再打开
          // 除了没有必要以外，还能避免因为网络延迟导致的重复打开
          const [existingTab] = await browser.tabs.query({
            url: `${url.trim().replace(/\/+$/, '')}/*`,
          })
          if (existingTab && existingTab.id) {
            if (!existingTab.active) {
              console.log('[laplace] keep-alive: reloading background tab', {
                id: existingTab.id,
                url,
              })
              await browser.tabs.reload(existingTab.id)
            } else {
              console.debug('[laplace] keep-alive: tab focused, skip', { id: existingTab.id, url })
            }
            return true
          } else {
            console.log('[laplace] keep-alive: opening background tab', { url })
          }

          const tab = await browser.tabs.create({
            url: url,
            active: false,
            pinned: true,
          })
          await sleep(5000)
          if (tab.id) {
            await browser.tabs.remove(tab.id)
          }
        }
      }
    }
  })

  browser.runtime.onMessage.addListener(
    (message: SyncRequest, _sender, sendResponse: (response: SyncResponse) => void) => {
      if (message?.type !== 'config') return false

      const payload = message.payload
      if (!payload || !payload['type']) return false

      uploadCookie(payload).then((result) => {
        if (result && typeof result === 'object') {
          sendResponse({
            message: result['action'] ?? 'fail',
            note: result['note'] ?? null,
          })
        } else {
          sendResponse({ message: 'fail', note: null })
        }
      })

      return true
    },
  )
})
