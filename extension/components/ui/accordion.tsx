'use client'

import { IconChevronDown } from '@tabler/icons-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import * as React from 'react'

type AccordionVariant = 'outline' | 'separated'
type AccordionSize = 'default' | 'sm' | 'xs'

const accordionVariants = cva('', {
  variants: {
    variant: {
      outline: 'w-full divide-y rounded-lg border border-fg/30 shadow-xs',
      separated: '',
    },
    size: {
      default: '',
      sm: '',
      xs: '',
    },
  },
  // Separated gap should match the trigger's size axis
  compoundVariants: [
    { variant: 'separated', size: 'default', className: 'space-y-3' },
    { variant: 'separated', size: 'sm', className: 'space-y-2' },
    { variant: 'separated', size: 'xs', className: 'space-y-1.5' },
  ],
  defaultVariants: {
    variant: 'outline',
    size: 'default',
  },
})

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      outline: 'border-fg/20',
      separated: [
        'rounded-lg border border-transparent bg-fg/5 transition-[background-color] duration-300',
        'data-open:border-fg/30 data-open:shadow-xs',
      ],
    },
  },
  defaultVariants: {
    variant: 'outline',
  },
})

export function Accordion({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root> & VariantProps<typeof accordionVariants>) {
  return (
    <AccordionPrimitive.Root
      data-slot='accordion'
      className={cn(accordionVariants({ variant, size }), className)}
      {...props}
    />
  )
}

interface AccordionItemProps
  extends React.ComponentProps<typeof AccordionPrimitive.Item>,
    VariantProps<typeof accordionItemVariants> {}

export function AccordionItem({ className, variant = 'outline', ...props }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item
      data-slot='accordion-item'
      className={cn(
        accordionItemVariants({ variant }),
        variant === 'separated' && 'data-open:bg-transparent',
        className
      )}
      {...props}
    />
  )
}

const accordionTriggerVariants = cva(
  [
    'flex w-full items-center justify-between gap-x-3 text-left',
    'data-open:bg-linear-to-b data-open:from-fg/5 data-open:to-fg/0 [&[data-state=open]>svg]:rotate-180',
    'focus-ring',
  ],
  {
    variants: {
      variant: {
        outline: [
          'data-open:rounded-none',
          '[[data-slot=accordion]>[data-slot=accordion-item]:first-child_&]:rounded-t-lg',
          '[[data-slot=accordion]>[data-slot=accordion-item]:last-child_&]:rounded-b-lg',
          '[[data-slot=accordion]>[data-slot=accordion-item]:last-child_&]:data-open:rounded-b-none',
        ],
        separated: 'rounded-lg data-open:rounded-b-none',
      },
      size: {
        default: 'p-3 [&>svg]:size-4',
        sm: 'p-2 text-sm [&>svg]:size-3.5',
        xs: 'p-1.5 text-xs [&>svg]:size-3',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  }
)

export function AccordionTrigger({
  className,
  children,
  withoutIcon = false,
  variant = 'outline',
  size = 'default',
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  withoutIcon?: boolean
  variant?: AccordionVariant
  size?: AccordionSize
}) {
  return (
    <AccordionPrimitive.Header className='flex'>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn(accordionTriggerVariants({ variant, size }), className)}
        {...props}
      >
        {children}
        {!withoutIcon && <IconChevronDown className='transition-transform duration-200' />}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

// Padding should match the trigger's size axis
const accordionContentVariants = cva('', {
  variants: {
    size: {
      default: 'p-3 pt-0',
      sm: 'p-2 pt-0',
      xs: 'p-1.5 pt-0',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

export function AccordionContent({
  className,
  children,
  size = 'default',
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content> & {
  size?: AccordionSize
}) {
  return (
    <AccordionPrimitive.Content
      data-slot='accordion-content'
      className={cn(
        'overflow-hidden transition-[height]',
        'data-closed:animate-accordion-up data-open:animate-accordion-down'
      )}
      {...props}
    >
      <div className={cn(accordionContentVariants({ size }), className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

type AccordionRootProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>

interface AccordionSingletonProps extends Omit<AccordionRootProps, 'type' | 'value' | 'onValueChange'> {
  items: {
    id: string | number
    label: React.ReactNode
    content: React.ReactNode
  }[]
  variant?: AccordionVariant
  size?: AccordionSize
  itemProps?: Partial<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>
  defaultValue?: string
}

export function AccordionSingleton({
  items,
  variant = 'outline',
  size = 'default',
  className,
  itemProps,
  defaultValue,
  ...props
}: AccordionSingletonProps) {
  const [value, setValue] = React.useState<string>(defaultValue ?? '')

  return (
    <AccordionPrimitive.Root
      data-slot='accordion'
      type='single'
      collapsible
      value={value}
      onValueChange={val => setValue(val ?? '')}
      className={cn(accordionVariants({ variant, size }), className)}
      {...props}
    >
      {items.map(item => (
        <AccordionPrimitive.Item
          data-slot='accordion-item'
          key={item.id}
          value={String(item.id)}
          className={cn(accordionItemVariants({ variant }), variant === 'separated' && 'data-open:bg-transparent')}
          {...itemProps}
        >
          <AccordionTrigger variant={variant} size={size}>
            {item.label}
          </AccordionTrigger>
          <AccordionContent size={size}>{item.content}</AccordionContent>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  )
}
