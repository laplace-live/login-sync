import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import type * as React from 'react'

// Canonical tint list; the cva `tint` map below is checked against it via `satisfies`
const alertTints = ['default', 'accent', 'danger', 'success', 'warning', 'info'] as const

const alertVariants = cva('relative w-full rounded-lg px-2 py-2 pl-1.5 text-base md:text-sm', {
  variants: {
    tint: {
      default: 'border-fg bg-fg/5 text-fg',
      accent: 'border-ac bg-ac/10 text-[color-mix(in_oklch,var(--color-ac),var(--color-fg)_60%)]',
      danger: 'border-rose-500 bg-rose-500/10 text-rose-500',
      success: 'border-emerald-500 bg-emerald-500/10 text-emerald-500',
      warning: 'border-orange-500 bg-orange-500/10 text-orange-500',
      info: 'border-blue-500 bg-blue-500/10 text-blue-500',
    } satisfies Record<(typeof alertTints)[number], string>,
  },
  defaultVariants: {
    tint: 'default',
  },
})

const alertDecoratorConfig: Record<(typeof alertTints)[number], string> = {
  default: 'bg-fg',
  accent: 'bg-ac',
  danger: 'bg-rose-500',
  success: 'bg-emerald-500',
  warning: 'bg-orange-500',
  info: 'bg-blue-500',
}

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
          className={cn('w-0.5 rounded-full', alertDecoratorConfig[tint ?? 'default'])}
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

export { Alert, alertTints, alertVariants }
