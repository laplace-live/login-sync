import type { ComponentProps } from 'react'

import { cn } from '~/utils/cn'

interface DividerProps extends ComponentProps<'div'> {
  label?: React.ReactNode
  extended?: boolean
}

function Divider({ label, extended, className, ...props }: DividerProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-xs',
        'after:border-t-fg/20 after:flex-1 after:border-t after:content-[""]',
        extended && 'before:border-t-fg/20 before:w-2.5 before:border-t before:content-[""]',
        className
      )}
      {...props}
    >
      {label}
    </div>
  )
}

export { Divider }
