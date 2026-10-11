import { cn } from '../../lib/utils'
import type { InputHTMLAttributes } from 'react'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ className, label, error, id, ...props }: Props) {
  const inputId = id || props.name
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-[var(--text)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        lang={props.type === 'date' || props.type === 'number' ? 'en' : props.lang}
        className={cn(
          'w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5',
          'text-[var(--text)] placeholder:text-[var(--text-muted)]',
          'focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]',
          'transition-shadow',
          error && 'border-[var(--danger)]',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
