import { STATIC_DOMAINS } from '@/lib/const'
import { load_data, remove_data, save_data } from '@/lib/storage'

export default defineContentScript({
  matches: ['*://*.bilibili.com/*', '*://*.laplace.live/*'],
  runAt: 'document_idle',
  async main() {
    window.addEventListener('load', async () => {
      const host = window.location.hostname
      const config = await load_data('COOKIE_SYNC_SETTING')

      // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
      const domainConfigs = STATIC_DOMAINS
      const domains = domainConfigs.map((c) => c.domain)

      if (domains) {
        // 检查 domain 是否部分匹配 domains的每一个域名
        let matched = false
        for (const domain of domains) {
          if (host.includes(domain)) matched = true
        }
        if (domains.length > 0 && !matched) return false
      }

      if (config?.type && config.type === 'down') {
        const the_data = await load_data('LS-' + host)
        if (the_data) {
          for (const key in the_data) {
            localStorage.setItem(key, the_data[key])
          }
          // 清空浏览器的storage，避免多次覆盖
          await remove_data('LS-' + host)
        }
      } else {
        const all = localStorage
        const keys = Object.keys(all)
        const values = Object.values(all)
        const result: {
          [key: string]: any
        } = {}
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = values[i]
        }
        if (Object.keys(result).length > 0) {
          await save_data('LS-' + host, result)
          console.log('save to storage', host, result)
        }
      }
    })
  },
})
