import '@plasmohq/messaging/background'

import browser from 'webextension-polyfill'

import type { ConfigProps } from '~types'

import { load_data, sleep, upload_cookie } from '../function'

export const life = 42
console.log(`HELLO WORLD - ${life}`)

browser.runtime.onInstalled.addListener(function (details) {
  if (details.reason == 'install') {
    browser.alarms.create('bg_1_minute', {
      when: Date.now(),
      periodInMinutes: 1
    })
  } else if (details.reason == 'update') {
    browser.alarms.create('bg_1_minute', {
      when: Date.now(),
      periodInMinutes: 1
    })
  }
})

browser.alarms.onAlarm.addListener(async (a) => {
  if (a.name == 'bg_1_minute') {
    const config: ConfigProps = await load_data('COOKIE_SYNC_SETTING')

    if (config) {
      if (config.type && config.type == 'pause') {
        console.log('暂停模式，不同步')
        return true
      }

      // 获得当前的分钟数
      const now = new Date()
      const minute = now.getMinutes()
      const hour = now.getHours()
      const day = now.getDate()
      // Total minutes from the begining of this month
      const minute_count = (day * 24 + hour) * 60 + minute

      if (config.uuid) {
        // 如果时间间隔可以整除分钟数，则进行同步
        if (config.interval < 1 || minute_count % config.interval == 0) {
          // 开始同步
          console.log(`同步时间到 ${minute_count} ${config.interval}`)
          const result = await upload_cookie(config)
          if (result && result['action'] == 'done') console.log('上传成功')
          else console.log(result)
        } else {
          console.log(`未到同步时间 ${minute_count} ${config.interval}`)
        }
      }

      if (config.keep_live) {
        // 按行分割，每行的格式为 url|interval
        const keep_live = config.keep_live?.trim()?.split('\n')
        for (let i = 0; i < keep_live.length; i++) {
          const line = keep_live[i]
          const parts = line.split('|')
          const url = parts[0]
          const interval = parts[1] ? parseInt(parts[1]) : 60
          if (interval > 0 && minute_count % interval == 0) {
            // 开始访问
            console.log(`keep live ${url} ${minute_count} ${interval}`)

            // 查询是否已经打开目标页面，如果已经打开，则不再打开
            // 除了没有必要以外，还能避免因为网络延迟导致的重复打开
            const [exists_tab] = await browser.tabs.query({
              url: `${url.trim().replace(/\/+$/, '')}/*`
            })
            if (exists_tab && exists_tab.id) {
              console.log(`tab已存在 ${exists_tab.id}`, exists_tab)
              if (!exists_tab.active) {
                // refresh tab
                console.log(`后台状态，刷新页面`)
                await browser.tabs.reload(exists_tab.id)
              } else {
                console.log(`前台状态，跳过`)
              }
              return true
            } else {
              console.log(`tab不存在，后台打开`)
            }

            // chrome tab create
            const tab = await browser.tabs.create({
              url: url,
              active: false,
              pinned: true
            })
            // 等待五秒后关闭
            await sleep(5000)
            if (tab.id) {
              await browser.tabs.remove(tab.id)
            }
          }
        }
      }
    }
  }
})
