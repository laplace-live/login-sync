import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'

import { cn } from '@/utils/cn'

const alertVariantsConfig = {
  tint: {
    default: 'bg-fg/5 text-fg border-fg',
    accent: 'bg-ac/10 text-[color-mix(in_oklch,var(--color-ac),var(--color-fg)_60%)] border-ac',
    danger: 'border-rose-500 text-rose-500 bg-rose-500/10',
    success: 'border-emerald-500 text-emerald-500 bg-emerald-500/10',
    warning: 'border-orange-500 text-orange-500 bg-orange-500/10',
    info: 'border-blue-500 text-blue-500 bg-blue-500/10',
  },
}

const alertDecoratorConfig: Record<keyof typeof alertVariantsConfig.tint, string> = {
  default: 'bg-fg',
  accent: 'bg-ac',
  danger: 'bg-rose-500',
  success: 'bg-emerald-500',
  warning: 'bg-orange-500',
  info: 'bg-blue-500',
}

const alertVariants = cva('relative w-full rounded px-2 py-2 pl-1.5 md:text-sm', {
  variants: alertVariantsConfig,
  defaultVariants: {
    tint: 'default',
  },
})

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {
  children?: React.ReactNode
  label?: React.ReactNode
  icon?: React.ReactNode
}

function Alert({ className, tint, children, label, icon, ...props }: React.ComponentProps<'div'> & AlertProps) {
  const content = typeof children === 'string' ? <div>{children}</div> : children

  return (
    <div role='alert' data-slot='alert' className={cn(alertVariants({ tint }), className)} {...props}>
      <div className='flex gap-2'>
        <div
          data-slot='alert-decorator'
          role='none'
          className={cn('w-0.5 rounded-sm', alertDecoratorConfig[tint ?? 'default'])}
        ></div>
        {icon && (
          <div data-slot='alert-icon' className='shrink-0 [&>svg]:-me-0.5 [&>svg]:size-5'>
            {icon}
          </div>
        )}
        <div className='w-full'>
          {label && <h5 className='font-medium leading-tight tracking-tight'>{label}</h5>}
          {content}
        </div>
      </div>
    </div>
  )
}

export { Alert, alertVariantsConfig }
