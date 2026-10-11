import { formatMoney } from '../../lib/utils'
import type { CustomerDebtReference } from '../../types'

const typeLabels: Record<string, string> = {
  sale: 'فاتورة',
  repair: 'صيانة',
}

export function CustomerDebtRefs({
  refs,
  currency,
  compact = false,
}: {
  refs: CustomerDebtReference[]
  currency?: string
  compact?: boolean
}) {
  if (!refs.length) return null

  return (
    <div className={compact ? 'mt-2 space-y-1' : 'mt-3 space-y-2 border-t border-[var(--border)] pt-3'}>
      {!compact && <p className="text-xs font-medium text-[var(--text-muted)]">مراجع الدين</p>}
      <ul className="space-y-1.5">
        {refs.map((ref) => (
          <li
            key={`${ref.type}-${ref.id}`}
            className="flex items-center justify-between gap-2 rounded-lg bg-[var(--bg-muted)] px-2.5 py-1.5 text-xs"
          >
            <span className="min-w-0 truncate">
              <span className="text-[var(--text-muted)]">{typeLabels[ref.type] || ref.type}: </span>
              <span className="font-mono font-medium">{ref.reference}</span>
            </span>
            <span className="shrink-0 font-semibold text-[var(--danger)]">
              {formatMoney(ref.amount_due, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
