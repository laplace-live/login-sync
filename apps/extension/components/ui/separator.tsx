'use client'

import { cn } from 'cn'
import { Separator as SeparatorPrimitive } from 'radix-ui'
import type * as React from 'react'

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

        // Horizontal mode needs to support inline text, use pseudo elements for lines.
        // Use flex-1 so each line grows to fill the remaining space alongside the children;
        // w-full would size each pseudo to 100% of the parent and overflow when combined with children.
        'data-horizontal:after:bg-fg/20 data-horizontal:after:content-[""]',
        'data-horizontal:after:h-px data-horizontal:after:flex-1',
        'data-horizontal:before:bg-fg/20 data-horizontal:before:content-[""]',
        'data-horizontal:before:h-px data-horizontal:before:flex-1',

        // Extended mode: short fixed-width tab on the opposite side from the children.
        // flex-none cancels flex-1 so the explicit width takes effect.
        'data-[extended=true]:data-[position=start]:data-horizontal:before:w-2.5',
        'data-[extended=true]:data-[position=start]:data-horizontal:before:flex-none',
        'data-[extended=true]:data-[position=end]:data-horizontal:after:w-2.5',
        'data-[extended=true]:data-[position=end]:data-horizontal:after:flex-none',

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
