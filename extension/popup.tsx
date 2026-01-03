import { useEffect, useState } from 'react'
import short_uid from 'short-uuid'
import { toast } from 'sonner'
import browser from 'webextension-polyfill'

import { sendToBackground } from '@plasmohq/messaging'

import type { RequestBody, ResponseBody } from '~background/messages/config'

import './global.css'

import { Accordion } from '~components/ui/accordion'
import Button from '~components/ui/button'
import { Divider } from '~components/ui/divider'
import Input from '~components/ui/input'
import { Radio } from '~components/ui/radio'
import { Toaster } from '~components/ui/sonner'
import type { ConfigProps } from '~types'

import { load_data, save_data } from './function'

// import type { RadioChangeEvent } from 'antd';
// import { Radio } from 'antd';

function IndexPopup() {
  let init: ConfigProps = {
    // endpoint: 'http://127.0.0.1:8088',
    endpoint: 'https://login-sync.laplace.cn',
    // "password": "",
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
    sync_laplace_live: false
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

    if (data['type'] == 'pause') {
      setIsLoading(false)
      toast('暂停状态不能' + action)
      return
    }

    try {
      const ret = await sendToBackground<RequestBody, ResponseBody>({
        name: 'config',
        body: {
          payload: {
            ...data,
            forceUpdate: true
          }
        }
      })

      console.log(action + '返回', ret)

      if (ret && ret['message'] == 'done') {
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
    if (JSON.stringify(ret) == JSON.stringify(data)) {
      push && test('手动同步')
      toast.info('保存成功', { id: 'save-sync' })
      // window.close();
    }
  }

  function onChange(name: string, e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // console.log( "e" , name , e.target.value );
    setData({ ...data, [name]: e.target.value ?? '' })
  }

  function onCheckboxChange(name: string, e: React.ChangeEvent<HTMLInputElement>) {
    setData({ ...data, [name]: e.target.checked })
  }

  function uuid_regen() {
    setData({ ...data, uuid: String(short_uid.generate()) })
  }

  function password_gen() {
    setData({ ...data, password: String(short_uid.generate()) })
  }

  function loginSyncTokenGenerate() {
    setData({
      ...data,
      uuid: String(short_uid.generate()),
      password: String(short_uid.generate())
    })
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
    <div className='w-128 overflow-x-hidden bg-white dark:bg-neutral-800' style={{ width: '360px' }}>
      <div className='form p-3'>
        <div className='text-line text-neutral-800 dark:text-neutral-200'>
          {/* <div className="">工作模式</div> */}
          {/* <h1 className="text-xl font-bold">LAPLACE Login Sync</h1> */}

          {/* <p className="mb-2">请确保 <a href={'https://www.bilibili.com'} target='_blank'>网站已登录</a>，然后点击「保存并同步」</p> */}

          {data['uuid'] && data['uuid'] === init['uuid'] && (
            <div className='mb-2 rounded bg-orange-400 p-2 text-white'>{browser.i18n.getMessage('notInitialized')}</div>
          )}

          <div className='mb-2 flex gap-2'>
            <div className='flex items-center gap-0.5'>
              <Radio
                id='up'
                name='working-method'
                value='up'
                checked={data['type'] === 'up'}
                onChange={(e) => onChange('type', e)}
              />
              <label htmlFor='up'>{browser.i18n.getMessage('syncLoginSessions')}</label>
            </div>

            {/* <div className="flex gap-0.5">
              <input
                type="radio"
                id="down"
                name="working-method"
                value="down"
                checked={data["type"] === "down"}
                onChange={(e) => onChange("type", e)}
              />
              <label htmlFor="down">覆盖到浏览器</label>
            </div> */}

            <div className='flex items-center gap-0.5'>
              <Radio
                id='pause'
                name='working-method'
                value='pause'
                checked={data['type'] === 'pause'}
                onChange={(e) => onChange('type', e)}
              />
              <label htmlFor='pause'>{browser.i18n.getMessage('pauseSyncing')}</label>
            </div>
          </div>

          {data['type'] && data['type'] != 'pause' && (
            <>
              {/* <div className=''>服务器地址</div>
              <input
                type='text'
                className='border-1 my-2 w-full rounded p-2'
                placeholder='请输入服务器地址'
                value={data['endpoint']}
                onChange={(e) => onChange('endpoint', e)}
              /> */}
              {/* <div className=''>同步密钥</div> */}
              <div className='flex flex-row items-center gap-1'>
                <div className='flex-1'>
                  <Input
                    type='text'
                    className='w-full'
                    placeholder='端对端用户密钥'
                    value={`${data['uuid']}@${data['password']}`}
                    readOnly
                  />
                </div>
                <div className='flex items-center gap-1'>
                  <Button onClick={() => copyToClipboard(`${data['uuid']}@${data['password']}`)}>
                    {browser.i18n.getMessage('copyToken')}
                  </Button>

                  {/* <Button color='red' onClick={() => setData(init)} disabled={isLoading}>
                    {browser.i18n.getMessage('reset')}
                  </Button> */}

                  {/* {data['uuid'] !== init['uuid'] && (
                    <Button
                      className='p-2 my-1 ml-2'
                      color='red'
                      onClick={() => loginSyncTokenGenerate()}
                      disabled={isLoading}
                    >
                      重新生成
                    </Button>
                  )} */}

                  <Button
                    onClick={() => {
                      save(true)
                    }}
                    disabled={isLoading}
                  >
                    {browser.i18n.getMessage('saveAndSync')}
                  </Button>
                </div>
              </div>

              <Accordion
                items={[
                  {
                    id: 'event-fetcher-faq',
                    label: <div className='flex items-center gap-2'>{browser.i18n.getMessage('advancedSettings')}</div>,
                    content: (
                      <div className='space-y-2'>
                        {/* <Input
                          type='text'
                          className='border-1 w-full rounded p-2'
                          placeholder='请输入服务器地址'
                          value={data['endpoint']}
                          onChange={(e) => onChange('endpoint', e)}
                          disabled
                        /> */}

                        {/* <div className='flex items-center space-x-2'>
                          <Checkbox
                            id='sync-laplace-live'
                            checked={data['sync_laplace_live']}
                            onChange={(e) => onCheckboxChange('sync_laplace_live', e)}
                          />
                          <Label htmlFor='sync-laplace-live'>Sync settings for laplace.live</Label>
                        </div>

                        <Divider
                          label={browser.i18n.getMessage('resetLabel')}
                          className='-mx-3 before:w-1.5'
                          extended
                        /> */}

                        <Button color='red' onClick={() => setData(init)} disabled={isLoading}>
                          {browser.i18n.getMessage('reset')}
                        </Button>

                        <p>{browser.i18n.getMessage('resetDesc')}</p>
                      </div>
                    )
                  }
                ]}
              />

              {/* <div className=''>用户KEY</div>
              <div className='flex flex-row'>
                <div className='left flex-1'>
                  <input
                    type='text'
                    className='border-1  my-2 p-2 rounded w-full'
                    placeholder='唯一用户ID'
                    value={data['uuid']}
                    onChange={(e) => onChange('uuid', e)}
                  />
                </div>
                <div className='right'>
                  <button
                    className='p-2 rounded my-2 ml-2'
                    onClick={() => uuid_regen()}
                  >
                    重新生成
                  </button>
                </div>
              </div>
              <div className=''>端对端加密密码</div>
              <div className='flex flex-row'>
                <div className='left flex-1'>
                  <input
                    type='text'
                    className='border-1  my-2 p-2 rounded w-full'
                    placeholder='丢失后数据失效，请妥善保管'
                    value={data['password']}
                    onChange={(e) => onChange('password', e)}
                  />
                </div>
                <div className='right'>
                  <button
                    className='p-2 rounded my-2 ml-2'
                    onClick={() => password_gen()}
                  >
                    自动生成
                  </button>
                </div>
              </div> */}

              {/* <div className=''>同步时间间隔·分钟</div>
              <input
                type='number'
                className='border-1  my-2 p-2 rounded w-full'
                placeholder='最少10分钟'
                value={data['interval']}
                onChange={(e) => onChange('interval', e)}
              /> */}

              {data['type'] && data['type'] == 'up' && (
                <>
                  {/* <div className=''>请求Header·选填</div>
                  <textarea
                    className='border-1  my-2 p-2 rounded w-full'
                    style={{ height: '60px' }}
                    placeholder="在请求时追加Header，用于服务端鉴权等场景，一行一个，格式为'Key:Value'，不能有空格"
                    onChange={(e) => onChange('headers', e)}
                    value={data['headers']}
                  />

                  <div className=''>同步域名关键词·选填</div>
                  <textarea
                    className='border-1  my-2 p-2 rounded w-full'
                    style={{ height: '60px' }}
                    placeholder='一行一个，同步包含关键词的全部域名，如qq.com,jd.com会包含全部子域名，留空默认同步全部'
                    onChange={(e) => onChange('domains', e)}
                    value={data['domains']}
                  />

                  <div className=''>同步域名黑名单·选填</div>
                  <textarea
                    className='border-1  my-2 p-2 rounded w-full'
                    style={{ height: '60px' }}
                    placeholder='黑名单仅在同步域名关键词为空时生效。一行一个域名，匹配则不参与同步'
                    onChange={(e) => onChange('blacklist', e)}
                    value={data['blacklist']}
                  /> */}

                  {/* <div className=''>Cookie保活·选填</div>
                  <textarea
                    className='border-1  my-2 p-2 rounded w-full'
                    style={{ height: '60px' }}
                    placeholder='定时后台刷新URL，模拟用户活跃。一行一个URL，默认60分钟，可用 URL|分钟数 的方式指定刷新时间'
                    onChange={(e) => onChange('keep_live', e)}
                    value={data['keep_live']}
                  /> */}
                </>
              )}
            </>
          )}

          {data['type'] && data['type'] == 'pause' && (
            <div>
              <div className='my-2 rounded border border-orange-600/50 bg-orange-600/10 p-2 text-orange-600 dark:border-orange-300/50 dark:bg-orange-300/10 dark:text-orange-300'>
                {browser.i18n.getMessage('loginSyncPaused')}
              </div>
              <div className='flex items-center justify-between'>
                <div />
                <div>
                  <Button
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
          <div className='mt-1.5 flex flex-row justify-between'>
            <div className='left text-neutral-400'>
              {data['type'] && data['type'] != 'pause' && (
                <>
                  {/* <Button
                    className='mr-2'
                    color='light'
                    onClick={() => test('手动同步')}
                    disabled={isLoading}
                  >
                    手动同步
                  </Button>
                  <Button
                    className='mr-2'
                    color='red'
                    onClick={() => setData(init)}
                    disabled={isLoading}
                  >
                    重置密钥
                  </Button>
                  <Button
                    className=''
                    color='light'
                    onClick={() => test('测试')}
                    disabled={isLoading}
                  >
                    测试
                  </Button> */}
                </>
              )}
            </div>
          </div>

          <Divider label={browser.i18n.getMessage('aboutLabel')} extended className='-mx-3 mb-2 mt-1.5 before:w-1.5' />

          {/* <div className='flex gap-2'>
            <a href={'https://www.bilibili.com'} target='_blank'>
              访问哔哩哔哩
            </a>
            <a href={'https://chat.laplace.live'} target='_blank'>
              访问 LAPLACE Chat
            </a>
          </div> */}

          <div className='text-neutral-500'>
            {/* <p><a href={'https://chat.laplace.live'} target="_blank">LAPLACE Login Sync</a>, based on <a href={'https://github.com/easychen/CookieCloud'} target="_blank">CookieCloud</a></p> */}
            <p>
              Brought to you by{' '}
              <a href={'https://laplace.live'} target='_blank'>
                LAPLACE
              </a>
              , based on{' '}
              <a href={'https://github.com/easychen/CookieCloud'} target='_blank'>
                CookieCloud
              </a>
            </p>
            <p>Tech otakus destroy the world</p>
          </div>
        </div>
      </div>

      <Toaster position='bottom-center' />
    </div>
  )
}

export default IndexPopup
