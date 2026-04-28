import type { ConfigProps } from './types'

export type SyncRequest = {
  type: 'config'
  payload: ConfigProps
}

export type SyncResponse = {
  message: string
  note: string | null
}

export const sendSync = (req: SyncRequest) =>
  browser.runtime.sendMessage(req) as Promise<SyncResponse>
