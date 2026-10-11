import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function TableScroll({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'max-w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
