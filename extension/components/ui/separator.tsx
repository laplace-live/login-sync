'use client'

import { Separator as SeparatorPrimitive } from 'radix-ui'
import type * as React from 'react'

import { cn } from '@/utils/cn'

function Separator({
  className,
  orientation = 'horizontal',
  extended = false,
  position = 'start',
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> & {
  extended?: boolean
  position?: 'center' | 'start' | 'end'
}) {
  return (
    <SeparatorPrimitive.Root
      data-slot='separator'
      decorative={decorative}
      orientation={orientation}
      data-extended={extended}
      data-position={position}
      className={cn(
        'relative flex items-center gap-1.5 whitespace-nowrap text-xs',

        // Horizontal mode needs to support inline text, use pseudo elements for lines
        'data-horizontal:after:bg-fg/20 data-horizontal:after:content-[""]',
        'data-horizontal:after:h-px data-horizontal:after:w-full data-horizontal:after:shrink-0',
        'data-horizontal:before:bg-fg/20 data-horizontal:before:content-[""]',
        'data-horizontal:before:h-px data-horizontal:before:w-full data-horizontal:before:shrink-0',

        // Extended mode
        // extended && 'before:border-t-fg/20 before:w-2.5 before:border-t before:content-[""]',
        'data-[extended=true]:data-[position=start]:data-horizontal:before:w-2.5',
        'data-[extended=true]:data-[position=end]:data-horizontal:after:w-2.5',

        // Positions
        'data-[extended=false]:data-[position=end]:data-horizontal:after:hidden',
        'data-[extended=false]:data-[position=start]:data-horizontal:before:hidden',

        // Vertical mode does not need to support inline text, use background color instead
        'data-vertical:bg-fg/20',
        'data-vertical:h-full data-vertical:w-px',
        className
      )}
      {...props}
    />
  )
}

export { Separator }
