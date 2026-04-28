import { toast } from 'sonner'

import type { ConfigProps } from '@/lib/types'

import { useSyncConfig } from '@/lib/use-sync-config'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Toaster } from '@/components/ui/sonner'

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function relativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return `${Math.floor(seconds / 86400)} 天前`
}

function App() {
  const { config, setConfig, save, sync, reset, restorePrevious, status, isConfigured, previousConfig, loadError } =
    useSyncConfig()
  // Gates every destructive action. When `loadError` is set, `config` holds
  // freshly-generated defaults rather than the user's real stored credentials —
  // any Save/Reset would silently clobber the still-intact storage with those
  // throwaway defaults. The danger alert below is defense-in-depth; this gate
  // is the actual safety.
  const isBusy = status !== 'idle' || loadError !== null

  async function handleSave({ andSync }: { andSync: boolean }) {
    try {
      await save(config)
      if (andSync && config.type !== 'pause') {
        const ret = await sync()
        toast.success(ret.note ?? '手动同步成功', { id: 'save-sync' })
      } else {
        toast.success('保存成功', { id: 'save-sync' })
      }
    } catch (err) {
      console.error('[laplace] save/sync failed', err)
      toast.error(describeError(err), { id: 'save-sync' })
    }
  }

  async function handleReset() {
    try {
      const undo = await reset()
      toast.success('已重置为新的登录密钥', {
        id: 'save-sync',
        duration: 8000,
        action: undo
          ? {
              label: browser.i18n.getMessage('resetUndo'),
              onClick: () => {
                undo()
                  .then(() => {
                    toast.success('已恢复上次登录密钥', { id: 'save-sync' })
                  })
                  .catch(err => {
                    console.error('[laplace] restore failed', err)
                    toast.error(describeError(err), { id: 'save-sync' })
                  })
              },
            }
          : undefined,
      })
    } catch (err) {
      console.error('[laplace] reset failed', err)
      toast.error(describeError(err), { id: 'save-sync' })
    }
  }

  async function handleRestore() {
    try {
      await restorePrevious()
      toast.success('已恢复上次登录密钥', { id: 'save-sync' })
    } catch (err) {
      console.error('[laplace] restore failed', err)
      toast.error(describeError(err), { id: 'save-sync' })
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast('已拷贝到剪切板', { id: 'copy-clipboard' })
    } catch (err) {
      toast.error(`拷贝至剪切板出错：${describeError(err)}`, { id: 'copy-clipboard' })
    }
  }

  return (
    <div className='w-lg overflow-x-hidden bg-white dark:bg-neutral-800' style={{ width: '360px' }}>
      <div className='space-y-2 p-3 text-line text-neutral-800 dark:text-neutral-200'>
        {loadError && (
          <Alert tint='danger'>
            <div className='space-y-2'>
              <p>
                {browser.i18n.getMessage('loadConfigFailed')} {describeError(loadError)}
              </p>
              <Button tint='rose' variant='solid' size='sm' onClick={() => window.location.reload()}>
                {browser.i18n.getMessage('reloadPopup')}
              </Button>
            </div>
          </Alert>
        )}

        {!loadError && !isConfigured && status !== 'loading' && (
          <Alert tint='warning'>{browser.i18n.getMessage('notInitialized')}</Alert>
        )}

        <RadioGroup
          name='working-method'
          value={config.type}
          onValueChange={value => setConfig({ ...config, type: value as ConfigProps['type'] })}
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

        {config.type !== 'pause' && (
          <>
            <div className='flex flex-row items-center gap-1'>
              <div className='flex-1'>
                <Input
                  type='text'
                  className='font-mono'
                  placeholder='端对端用户密钥'
                  value={`${config.uuid}@${config.password}`}
                  readOnly
                />
              </div>
              <div className='flex items-center gap-1'>
                <Button onClick={() => copyToClipboard(`${config.uuid}@${config.password}`)}>
                  {browser.i18n.getMessage('copyToken')}
                </Button>

                <Button tint='accent' onClick={() => handleSave({ andSync: true })} disabled={isBusy}>
                  {browser.i18n.getMessage('saveAndSync')}
                </Button>
              </div>
            </div>

            <Accordion type='single' collapsible>
              <AccordionItem value='advanced-settings'>
                <AccordionTrigger>{browser.i18n.getMessage('advancedSettings')}</AccordionTrigger>
                <AccordionContent className='space-y-2'>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button tint='red' size='sm' disabled={isBusy}>
                        {browser.i18n.getMessage('reset')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent size='sm'>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{browser.i18n.getMessage('resetConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{browser.i18n.getMessage('resetConfirmDesc')}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{browser.i18n.getMessage('resetConfirmCancel')}</AlertDialogCancel>
                        <AlertDialogAction tint='red' variant='solid' onClick={handleReset}>
                          {browser.i18n.getMessage('resetConfirmAction')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <p className='text-fg/60'>{browser.i18n.getMessage('resetDesc')}</p>

                  {previousConfig && (
                    <div className='space-y-2 border-fg/10 border-t pt-2'>
                      <Button tint='accent' size='sm' onClick={handleRestore} disabled={isBusy}>
                        {browser.i18n.getMessage('restorePrevious')}
                      </Button>
                      <p className='text-fg/60'>
                        {browser.i18n.getMessage('restorePreviousDesc')}{' '}
                        <span className='text-fg/40'>({relativeTime(previousConfig.savedAt)})</span>
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </>
        )}

        {config.type === 'pause' && (
          <div className='space-y-2'>
            <Alert tint='warning'>{browser.i18n.getMessage('loginSyncPaused')}</Alert>
            <div className='flex items-center justify-between'>
              <div />
              <div>
                <Button tint='accent' onClick={() => handleSave({ andSync: false })} disabled={isBusy}>
                  {browser.i18n.getMessage('save')}
                </Button>
              </div>
            </div>
          </div>
        )}

        <Separator extended className='-mx-3 mt-1.5 mb-2'>
          {browser.i18n.getMessage('aboutLabel')}
        </Separator>

        <div className='text-fg/60'>
          <p>
            Brought to you by{' '}
            <a href='https://laplace.live' target='_blank' className='font-semibold text-ac' rel='noopener'>
              LAPLACE
            </a>
            , source code on{' '}
            <a
              href='https://github.com/laplace-live/login-sync'
              target='_blank'
              className='font-semibold text-ac'
              rel='noopener'
            >
              GitHub
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
