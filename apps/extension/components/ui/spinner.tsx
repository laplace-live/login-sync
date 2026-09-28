import { cn } from 'cn'

function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <svg
      data-slot='spinner'
      xmlns='http://www.w3.org/2000/svg'
      width='24'
      height='24'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2'
      strokeLinecap='round'
      strokeLinejoin='round'
      role='status'
      aria-label='Loading'
      className={cn('size-4 animate-spin', className)}
      {...props}
    >
      <circle cx='12' cy='12' r='9' opacity='0.4' />
      <path d='M12 3a9 9 0 0 1 9 9' />
    </svg>
  )
}

export { Spinner }
