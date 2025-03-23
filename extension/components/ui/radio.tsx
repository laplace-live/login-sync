'use client'

import { IconCircle } from '@tabler/icons-react'
import * as React from 'react'

import { cn } from '~/utils/cn'

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({ className, ...props }, ref) => (
  <div className='relative inline-flex'>
    <input
      type='radio'
      ref={ref}
      className={cn(
        'peer h-4 w-4 cursor-pointer appearance-none rounded-full border border-neutral-800/20 bg-white/10',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'checked:border-violet-600 checked:bg-violet-600',
        'dark:border-neutral-200/20 dark:bg-neutral-800/10 dark:checked:border-violet-400 dark:checked:bg-violet-400',
        className
      )}
      {...props}
    />
    <div className='pointer-events-none absolute flex size-4 items-center justify-center text-white opacity-0 peer-checked:opacity-100 dark:text-neutral-800'>
    <IconCircle className='size-2 fill-current' />
    </div>
  </div>
))
Radio.displayName = 'Radio'

export { Radio }
