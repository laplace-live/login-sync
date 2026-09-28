import type { ConfigProps } from './types'

export type SyncRequest = {
  type: 'config'
  payload: ConfigProps
}

export type SyncResponse = {
  message: string
  note: string | null
}

function isSyncResponse(value: unknown): value is SyncResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string' &&
    'note' in value &&
    (typeof value.note === 'string' || value.note === null)
  )
}

/** Resolves `undefined` when the reply isn't a `SyncResponse`, e.g. when the background listener declines the message. */
export async function sendSync(req: SyncRequest): Promise<SyncResponse | undefined> {
  const response: unknown = await browser.runtime.sendMessage(req)
  return isSyncResponse(response) ? response : undefined
}
