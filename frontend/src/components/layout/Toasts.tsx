import { X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { cn } from '../../lib/utils'

export function Toasts() {
  const { toasts, remove } = useToastStore()
  return (
    <div className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex min-w-[280px] items-center gap-3 rounded-xl border px-4 py-3 shadow-lg',
            'bg-[var(--bg-card)] border-[var(--border)]',
            t.type === 'success' && 'border-emerald-500/50',
            t.type === 'error' && 'border-red-500/50',
          )}
        >
          <p className="flex-1 text-sm">{t.message}</p>
          <button onClick={() => remove(t.id)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
