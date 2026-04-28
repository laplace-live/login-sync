'use client'

import {
  IconAlertCircleFilled,
  IconAlertTriangleFilled,
  IconCircleCheckFilled,
  IconInfoCircleFilled,
  IconMinus,
} from '@tabler/icons-react'
// https://ui.shadcn.com/docs/components/sonner
import { Toaster as Sonner } from 'sonner'

import { Loading } from './loading'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className='unstyled'
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: 'group floating p-4 rounded-lg flex gap-2 items-center w-(--width)',
          title: 'font-medium text-sm',
          description: 'text-sm text-fg/60',
          // closeButton:
          //   'group-hover:opacity-100 opacity-0 bg-bg shadow-border absolute -top-1 -left-1.5 rounded-full size-5 flex items-center justify-center',
          closeButton:
            'group-hover:opacity-100 opacity-0 absolute top-1 left-1 size-4 flex focus-ring items-center justify-center hover:bg-ac/10 rounded hover:text-ac',
          content: 'flex-auto space-y-0.5',
          info: '**:data-icon:text-sky-500',
          success: '**:data-icon:text-emerald-500',
          warning: '**:data-icon:text-amber-500',
          error: '**:data-icon:text-rose-500',
          actionButton:
            'shrink-0 px-2 py-0.5 text-sm rounded-sm border border-fg/30 shadow-xs focus-ring hover:bg-fg/5',
          cancelButton: 'shrink-0 px-2 py-0.5 text-sm rounded-sm focus-ring',
          loader: 'flex items-center',
          icon: 'relative flex flex-shrink-0 items-center self-start size-5 -ml-0.5 [&>svg]:flex [&>svg]:flex-auto',
        },
      }}
      // https://sonner.emilkowal.ski/styling#changing-icons
      icons={{
        success: <IconCircleCheckFilled className='size-5' />,
        info: <IconInfoCircleFilled className='size-5' />,
        warning: <IconAlertTriangleFilled className='size-5' />,
        error: <IconAlertCircleFilled className='size-5' />,
        loading: <Loading className='size-5' />,
        close: <IconMinus className='size-3' />,
      }}
      gap={10}
      {...props}
    />
  )
}

export { Toaster }
