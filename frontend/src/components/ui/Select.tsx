import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { SelectHTMLAttributes } from 'react'

interface Option {
  value: string
  label: string
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string
  options: Option[]
  value: string
  onChange: (value: string) => void
  error?: string
}

export function Select({ label, options, value, onChange, className, error, id, ...props }: Props) {
  const selectId = id || props.name

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium text-[var(--text)]">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'mobishop-select w-full appearance-none rounded-xl border border-[var(--border)]',
            'bg-[var(--bg-card)] px-4 py-2.5 pl-10 text-sm text-[var(--text)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40 focus:border-[var(--primary)]',
            error && 'border-[var(--danger)]',
          )}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
      </div>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
