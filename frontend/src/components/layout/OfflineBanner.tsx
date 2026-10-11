import { CloudOff, RefreshCw, Wifi } from 'lucide-react'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { cn } from '../../lib/utils'
import { useOfflineSync } from '../../offline/useOfflineSync'

export function OfflineBanner() {
  const store = useCurrentStore()
  const { online, pending, syncing, error, runSync } = useOfflineSync(store?.id)

  if (online && pending === 0 && !error) return null

  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm',
        online
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200'
          : 'border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-100',
      )}
      role="status"
    >
      <div className="flex items-center gap-2">
        {online ? <Wifi className="h-4 w-4 shrink-0" /> : <CloudOff className="h-4 w-4 shrink-0" />}
        <span>
          {!online
            ? 'وضع عدم الاتصال — يمكن حفظ المبيعات والمشتريات والصيانة والمصاريف والعملاء وستُزامَن لاحقاً'
            : pending > 0
              ? `${pending} عملية بانتظار المزامنة`
              : error
                ? error
                : null}
          {error && pending > 0 ? ` — ${error}` : null}
        </span>
      </div>
      {online && pending > 0 && (
        <button
          type="button"
          onClick={() => void runSync()}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-current/30 px-2.5 py-1 text-xs font-medium hover:bg-black/5 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          مزامنة الآن
        </button>
      )}
    </div>
  )
}
