import type { DomainConfig } from '~types'

export const DEFAULT_SYNC_SERVER = 'https://login-sync.laplace.cn'

export const STATIC_DOMAINS: DomainConfig[] = [
  {
    domain: 'bilibili.com',
    localStorage: false
  },
  {
    domain: 'laplace.live',
    localStorage: true
  }
]
