'use client'

import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { cva } from 'class-variance-authority'
import { IconChevronDown } from '@tabler/icons-react'
import * as React from 'react'

import { cn } from '~/utils/cn'

type AccordionVariant = 'outline' | 'separated'

const accordionVariants = cva('', {
  variants: {
    variant: {
      outline: 'divide-y rounded-md border my-2 w-full',
      separated: 'space-y-3 my-2'
    }
  },
  defaultVariants: {
    variant: 'outline'
  }
})

const accordionItemVariants = cva('', {
  variants: {
    variant: {
      outline: '',
      separated: [
        'rounded-md border border-transparent bg-fg/5 transition-[background-color] duration-300',
        'data-[state=open]:border-fg/30'
      ]
    }
  },
  defaultVariants: {
    variant: 'outline'
  }
})

function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className='flex'>
      <AccordionPrimitive.Trigger
        data-slot='accordion-trigger'
        className={cn(
          'flex w-full items-center justify-between gap-x-3 px-3 py-3 text-left',
          'data-[state=open]:from-fg/5 data-[state=open]:to-fg/0 data-[state=open]:bg-linear-to-b [&[data-state=open]>svg]:rotate-180',
          'focus-ring',
          className
        )}
        {...props}
      >
        <div className='font-medium'>{children}</div>
        <IconChevronDown className='size-4 transition-transform duration-200' />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot='accordion-content'
      className={cn(
        'overflow-hidden transition-[height]',
        'data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down',
        className
      )}
      {...props}
    >
      <div className='px-3 pb-2'>{children}</div>
    </AccordionPrimitive.Content>
  )
}

type AccordionRootProps = React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root>

interface AccordionProps extends Omit<AccordionRootProps, 'type' | 'value' | 'onValueChange'> {
  items: {
    id: string | number
    label: React.ReactNode
    content: React.ReactNode
  }[]
  variant?: AccordionVariant
  itemProps?: Partial<React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>>
  defaultValue?: string
}

function Accordion({ items, variant = 'outline', className, itemProps, defaultValue, ...props }: AccordionProps) {
  const [value, setValue] = React.useState<string | undefined>(defaultValue)

  return (
    <AccordionPrimitive.Root
      data-slot='accordion'
      type='single'
      collapsible
      value={value}
      onValueChange={setValue}
      className={cn(accordionVariants({ variant }), className)}
      {...props}
    >
      {items.map((item) => (
        <AccordionPrimitive.Item
          key={item.id}
          value={String(item.id)}
          className={cn(
            accordionItemVariants({ variant }),
            variant === 'separated' && value === String(item.id) && 'bg-transparent'
          )}
          {...itemProps}
        >
          <AccordionTrigger>{item.label}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  )
}

export { Accordion }
