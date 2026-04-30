import React from 'react'

export default function Input({ children, className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded border border-neutral-800/20 bg-transparent px-2 py-1 font-mono dark:border-neutral-200/20 ${
        className || ''
      }`}
      {...props}
    />
  )
}
