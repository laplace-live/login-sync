import clsx from 'clsx'
import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  color?: 'red' | 'light' | 'violet'
}

export default function Button({ color, children, className, ...props }: ButtonProps) {
  const c = color || 'violet'

  return (
    <button
      className={clsx(
        c === 'light' && [
          'rounded border border-neutral-600/20 bg-neutral-600/10 px-2 py-1 font-bold text-neutral-600 hover:bg-neutral-600/20',
          'dark:border-neutral-300/20 dark:bg-neutral-300/10 dark:text-neutral-300 dark:hover:bg-neutral-300/20',
          'disabled:pointer-events-none disabled:opacity-40'
        ],
        c === 'violet' && [
          'rounded border border-violet-600/20 bg-violet-600/10 px-2 py-1 font-bold text-violet-600 hover:bg-violet-600/20',
          'dark:border-violet-300/20 dark:bg-violet-300/10 dark:text-violet-300 dark:hover:bg-violet-300/20',
          'disabled:pointer-events-none disabled:opacity-40'
        ],
        c === 'red' && [
          'rounded border border-red-600/20 bg-red-600/10 px-2 py-1 font-bold text-red-600 hover:bg-red-600/20',
          'dark:border-red-300/20 dark:bg-red-300/10 dark:text-red-300 dark:hover:bg-red-300/20',
          'disabled:pointer-events-none disabled:opacity-40'
        ],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
