'use client'

import { IconChevronDown } from '@tabler/icons-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import * as React from 'react'

import { cn } from '@/utils/cn'

type AccordionVariant = 'outline' | 'separated'

const accordionVariants = cva('', {
  variants: {
    variant: {
      outline: 'w-full divide-y rounded-md border border-fg/30 shadow-xs',
      separated: 'space-y-3',
    },
  },
  defaultVariants: {
    variant: 'outline',
  },
})

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      outline: 'border-fg/20',
      separated: [
        'rounded-md border border-transparent bg-fg/5 transition-[background-color] duration-300',
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
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root> & VariantProps<typeof accordionVariants>) {
  return (
    <AccordionPrimitive.Root
      data-slot='accordion'
      className={cn(accordionVariants({ variant }), className)}
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

export function AccordionTrigger({
  className,
  children,
  withoutIcon = false,
  variant = 'outline',
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  withoutIcon?: boolean
  variant?: AccordionVariant
}) {
  return (
    <AccordionPrimitive.Header className='flex'>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn(
          'flex w-full items-center justify-between gap-x-3 rounded p-2 text-left',
          'data-open:bg-linear-to-b data-open:from-fg/5 data-open:to-fg/0 [&[data-state=open]>svg]:rotate-180',
          'focus-ring',
          variant === 'outline' && [
            'data-open:rounded-t-none',
            '[[data-slot=accordion]>[data-slot=accordion-item]:first-child_&]:data-open:rounded-t',
          ],
          className
        )}
        {...props}
      >
        {children}
        {!withoutIcon && <IconChevronDown className='size-4 transition-transform duration-200' />}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot='accordion-content'
      className={cn(
        'overflow-hidden transition-[height]'
        // TODO: This causes the extension popup flashing
        // 'data-closed:animate-accordion-up data-open:animate-accordion-down'
      )}
      {...props}
    >
      <div className={cn('p-2 pt-0', className)}>{children}</div>
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
  itemProps?: Partial<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>
  defaultValue?: string
}

export function AccordionSingleton({
  items,
  variant = 'outline',
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
      className={cn(accordionVariants({ variant }), className)}
      {...props}
    >
      {items.map(item => (
        <AccordionPrimitive.Item
          key={item.id}
          value={String(item.id)}
          className={cn(accordionItemVariants({ variant }), variant === 'separated' && 'data-open:bg-transparent')}
          {...itemProps}
        >
          <AccordionTrigger variant={variant}>{item.label}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  )
}
