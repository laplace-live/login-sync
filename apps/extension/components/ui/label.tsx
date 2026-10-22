'use client'

import { IconAsterisk } from '@tabler/icons-react'
import { cn } from 'cn'
import { Label as LabelPrimitive } from 'radix-ui'

function Label({
  className,
  required = false,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  required?: boolean
}) {
  return (
    <LabelPrimitive.Root
      data-slot='label'
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium whitespace-nowrap select-none',

        // Disabled state
        'group-data-disabled:pointer-events-none group-data-disabled:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden='true' className='pointer-events-none text-rose-500'>
          <IconAsterisk className='size-3' />
        </span>
      )}
    </LabelPrimitive.Root>
  )
}

export { Label }
