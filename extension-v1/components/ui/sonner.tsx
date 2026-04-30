'use client'

import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // className='unstyled'
      toastOptions={{
        // unstyled: true,
        classNames: {
          toast:
            'floating px-3 py-2 rounded-lg flex gap-2 items-center w-[--width] text-neutral-800 dark:text-neutral-200',
          title: 'font-medium text-sm',
          description: 'text-sm',
          closeButton: 'floating',
          actionButton: 'shrink-0 px-2 py-1 text-sm rounded border border-[currentColor]',
          cancelButton: 'shrink-0 px-2 py-1 text-sm rounded',
          info: '[&_[data-icon]]:text-sky-600',
          success: '[&_[data-icon]]:text-green-600',
          warning: '[&_[data-icon]]:text-amber-600',
          error: '[&_[data-icon]]:text-red-600',
          loader: 'flex items-center'
        }
      }}
      gap={10}
      {...props}
    />
  )
}

export { Toaster }
