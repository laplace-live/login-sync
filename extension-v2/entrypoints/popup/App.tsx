import { useEffect, useState } from 'react'
import short_uid from 'short-uuid'
import { toast } from 'sonner'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {Button} from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {Input} from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Toaster } from '@/components/ui/sonner'
import { sendSync } from '@/lib/messaging'
import { load_data, save_data } from '@/lib/storage'
import type { ConfigProps } from '@/lib/types'
import { Alert } from '@/components/ui/alert'
import { DEFAULT_SYNC_SERVER } from '@/lib/const'

function App() {
  const init: ConfigProps = {
    endpoint: DEFAULT_SYNC_SERVER,
    password: String(short_uid.generate()),
    interval: 2,
    // NOTE: as a fork of the original code, we don't use the domains field. so get domains fron const
    // This setting does not have any effect, keep it for compatibility
    domains: 'bilibili.com',
    uuid: String(short_uid.generate()),
    type: 'up',
    keep_live: '',
    blacklist: 'google.com',
    headers: '',
    forceUpdate: false,
    sync_laplace_live: false,
  }
  const [data, setData] = useState(init)
  const [isLoading, setIsLoading] = useState(false)

  async function test(action = '测试') {
    console.log('request,begin')
    setIsLoading(true)

    if (!data['endpoint'] || !data['password'] || !data['uuid'] || !data['type']) {
      setIsLoading(false)
      toast('请填写完整的信息')
      return
    }

    if (data['type'] === 'pause') {
      setIsLoading(false)
      toast('暂停状态不能' + action)
      return
    }

    try {
      const ret = await sendSync({
        type: 'config',
        payload: {
          ...data,
          forceUpdate: true,
        },
      })

      console.log(action + '返回', ret)

      if (ret && ret['message'] === 'done') {
        if (ret['note']) toast(ret['note'])
        else toast.success(action + '成功', { id: 'save-sync' })
      } else {
        toast.error(action + '失败，请检查填写的信息是否正确', { id: 'save-sync' })
      }
    } catch (error) {
      console.error('Failed to run test:', error)
      toast.error(action + '失败：' + String(error), { id: 'test-error' })
    }

    setIsLoading(false)
  }

  async function save(push: boolean) {
    if (!data['endpoint'] || !data['password'] || !data['uuid'] || !data['type']) {
      toast('请填写完整的信息', { id: 'saveError' })
      return
    }
    await save_data('COOKIE_SYNC_SETTING', data)
    const ret = await load_data('COOKIE_SYNC_SETTING')
    console.log('load', ret)
    if (JSON.stringify(ret) === JSON.stringify(data)) {
      push && test('手动同步')
      toast.info('保存成功', { id: 'save-sync' })
    }
  }

  function onChange(name: string, e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setData({ ...data, [name]: e.target.value ?? '' })
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast('已拷贝到剪切板', { id: 'copySuccess' })
    } catch (err) {
      toast(`拷贝至剪切板出错：${err}`, { id: 'copyError' })
    }
  }

  useEffect(() => {
    async function load_config() {
      const ret = await load_data('COOKIE_SYNC_SETTING')
      if (ret) setData({ ...data, ...ret })
    }
    load_config()
  }, [])

  return (
    <div className='w-lg overflow-x-hidden bg-white dark:bg-neutral-800' style={{ width: '360px' }}>
      <div className='p-3 space-y-2 text-line text-neutral-800 dark:text-neutral-200'>
        {data['uuid'] && data['uuid'] === init['uuid'] && (
          <Alert tint='warning'>
            {browser.i18n.getMessage('notInitialized')}
          </Alert>
        )}

        <RadioGroup
          name='working-method'
          value={data['type']}
          onValueChange={(value) => setData({ ...data, type: value as ConfigProps['type'] })}
          className='flex gap-2'
        >
          <div className='flex items-center gap-1.5'>
            <RadioGroupItem id='up' value='up' />
            <label htmlFor='up'>{browser.i18n.getMessage('syncLoginSessions')}</label>
          </div>

          <div className='flex items-center gap-1.5'>
            <RadioGroupItem id='pause' value='pause' />
            <label htmlFor='pause'>{browser.i18n.getMessage('pauseSyncing')}</label>
          </div>
        </RadioGroup>

        {data['type'] && data['type'] !== 'pause' && (
          <>
            <div className='flex flex-row items-center gap-1'>
              <div className='flex-1'>
                <Input
                  type='text'
                  className='font-mono'
                  placeholder='端对端用户密钥'
                  value={`${data['uuid']}@${data['password']}`}
                  readOnly
                />
              </div>
              <div className='flex items-center gap-1'>
                <Button onClick={() => copyToClipboard(`${data['uuid']}@${data['password']}`)}>
                  {browser.i18n.getMessage('copyToken')}
                </Button>

                <Button
                  tint='accent'
                  onClick={() => {
                    save(true)
                  }}
                  disabled={isLoading}
                >
                  {browser.i18n.getMessage('saveAndSync')}
                </Button>
              </div>
            </div>

            <Accordion type='single' collapsible>
              <AccordionItem value='advanced-settings'>
                <AccordionTrigger>
                  {browser.i18n.getMessage('advancedSettings')}
                </AccordionTrigger>
                <AccordionContent className='space-y-2'>
                  <Button tint='red' size='sm' onClick={() => setData(init)} disabled={isLoading}>
                    {browser.i18n.getMessage('reset')}
                  </Button>

                  <p className='text-fg/60'>{browser.i18n.getMessage('resetDesc')}</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        {data['type'] && data['type'] === 'pause' && (
          <div className='space-y-2'>
            <Alert tint='warning'>
              {browser.i18n.getMessage('loginSyncPaused')}
            </Alert>
            <div className='flex items-center justify-between'>
              <div />
              <div>
                <Button
                  tint='accent'
                  onClick={() => {
                    save(false)
                  }}
                  disabled={isLoading}
                >
                  {browser.i18n.getMessage('save')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator extended className='-mx-3 mb-2 mt-1.5'>
          {browser.i18n.getMessage('aboutLabel')}
        </Separator>

        <div className='text-fg/60'>
          <p>
            Brought to you by{' '}
            <a href='https://laplace.live' target='_blank' className='font-semibold text-ac'>
              LAPLACE
            </a>
            , based on{' '}
            <a href='https://github.com/easychen/CookieCloud' target='_blank' className='font-semibold text-ac'>
              CookieCloud
            </a>
          </p>
          <p>Tech otakus destroy the world</p>
        </div>
      </div>

      <Toaster position='bottom-center' />
    </div>
  )
}

export default App
