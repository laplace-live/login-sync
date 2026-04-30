import type { PlasmoMessaging } from '@plasmohq/messaging'

import type { ConfigProps } from '~types'

import { upload_cookie } from '../../function'

export type RequestBody = {
  payload: ConfigProps
}

export type ResponseBody = {
  message: string
  note: string | null
}

export const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = async (req, res) => {
  // 获得cookie，并进行过滤
  const payload = req.body?.payload

  if (payload && payload['type']) {
    const result = await upload_cookie(payload)
    res.send({
      message: result['action'],
      note: result['note']
    })
  }
}

export default handler
