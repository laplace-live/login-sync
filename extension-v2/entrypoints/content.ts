import { STATIC_DOMAINS, STORAGE_KEY_CONFIG, STORAGE_KEY_LS_PREFIX } from '@/lib/const'
import { loadData, removeData, saveData } from '@/lib/storage'

export default defineContentScript({
  matches: ['*://*.bilibili.com/*', '*://*.laplace.live/*'],
  runAt: 'document_idle',
  async main() {
    window.addEventListener('load', async () => {
      const host = window.location.hostname
      const config = await loadData(STORAGE_KEY_CONFIG)

      // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
      const domainConfigs = STATIC_DOMAINS
      const domains = domainConfigs.map(c => c.domain)

      if (domains) {
        // 检查 domain 是否部分匹配 domains的每一个域名
        let matched = false
        for (const domain of domains) {
          if (host.includes(domain)) matched = true
        }
        if (domains.length > 0 && !matched) return false
      }

      const lsKey = `${STORAGE_KEY_LS_PREFIX}${host}`

      if (config?.type && config.type === 'down') {
        const stored = await loadData(lsKey)
        if (stored) {
          for (const key in stored) {
            localStorage.setItem(key, stored[key])
          }
          // 清空浏览器的storage，避免多次覆盖
          await removeData(lsKey)
        }
      } else {
        const all = localStorage
        const keys = Object.keys(all)
        const values = Object.values(all)
        const result: Record<string, string> = {}
        for (let i = 0; i < keys.length; i++) {
          result[keys[i]] = values[i]
        }
        if (Object.keys(result).length > 0) {
          await saveData(lsKey, result)
          console.debug('[laplace] localStorage mirrored', {
            host,
            keys: Object.keys(result).length,
          })
        }
      }
    })
  },
})
