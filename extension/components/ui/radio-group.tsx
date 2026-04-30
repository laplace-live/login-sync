'use client'

import { IconCircleFilled } from '@tabler/icons-react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/utils/cn'

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot='radio-group' className={cn('grid gap-2', className)} {...props} />
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot='radio-group-item'
      className={cn(
        'focus-ring aspect-square size-4 shrink-0 rounded-full border border-fg/30 text-ac shadow-xs outline-none aria-invalid:border-rose-500 aria-invalid:ring-rose-500/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot='radio-group-indicator'
        className='relative flex items-center justify-center'
      >
        <IconCircleFilled className='size-2.5' />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
