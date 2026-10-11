import { lazy, Suspense, useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { Bot, Maximize2, MessageCircle, Sparkles, X } from 'lucide-react'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { hasPermission } from '../../lib/permissions'
import { cn } from '../../lib/utils'

const AssistantPanel = lazy(() =>
  import('./AssistantMiniPanel').then((m) => ({ default: m.AssistantMiniPanel })),
)

/** Floating professional chat widget — primary assistant entry (hidden on POS). */
export function AssistantFab() {
  const store = useCurrentStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState(false)
  const titleId = useId()

  const featureEnabled = store?.ai_assistant_enabled !== false
  const allowed = featureEnabled && hasPermission(store?.role, 'ai_assistant')
  const onPos = location.pathname.startsWith('/pos')
  const onFullAssistant = location.pathname.includes('/assistant')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    setOpen(false)
  }, [store?.id])

  useEffect(() => {
    if (!allowed || onPos || onFullAssistant) return
    const seen = sessionStorage.getItem('mobishop_assistant_hint')
    if (seen) return
    const t = window.setTimeout(() => setHint(true), 1800)
    const hide = window.setTimeout(() => {
      setHint(false)
      sessionStorage.setItem('mobishop_assistant_hint', '1')
    }, 7000)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(hide)
    }
  }, [allowed, onPos, onFullAssistant])

  if (!allowed || onPos || onFullAssistant) return null

  const widget = (
    <div className="pointer-events-none fixed inset-0 z-[90]" aria-live="polite">
      {open && (
        <button
          type="button"
          aria-label="إغلاق المساعد"
          className="pointer-events-auto absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
          onClick={() => setOpen(false)}
        />
      )}

      <div
        className={cn(
          'pointer-events-none absolute bottom-5 left-5 flex flex-col items-start gap-3',
          'max-sm:bottom-3 max-sm:left-3 max-sm:right-auto',
        )}
      >
        {open && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={cn(
              'pointer-events-auto flex w-[min(100vw-1.5rem,26rem)] flex-col overflow-hidden',
              'rounded-[1.35rem] border border-white/10 bg-[var(--bg-card)]',
              'shadow-[0_25px_60px_-15px_rgb(15_23_42/0.45)]',
              'h-[min(74vh,38rem)] max-sm:h-[min(88dvh,42rem)] max-sm:w-[min(100vw-1.5rem,26rem)]',
              'animate-[assistant-rise_200ms_ease-out]',
            )}
          >
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#1e3a8a] via-[var(--primary)] to-[#38bdf8] px-4 py-4 text-white">
              <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 0, transparent 45%)' }} aria-hidden />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30 shadow-inner">
                    <Bot className="h-6 w-6" />
                    <span className="absolute -bottom-0.5 -left-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 ring-2 ring-[#1e3a8a]">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 id={titleId} className="flex items-center gap-1.5 truncate text-[15px] font-bold tracking-tight">
                      مساعد موبي شوب الذكي
                      <Sparkles className="h-3.5 w-3.5 text-amber-200" />
                    </h2>
                    <p className="mt-0.5 text-[11px] text-white/85">
                      دعم فني · تحليل المتجر · طلبات الدعم
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to="/smart-business/assistant"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                    aria-label="فتح الصفحة الكاملة"
                    title="صفحة كاملة"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/15 hover:text-white"
                    aria-label="إغلاق"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </header>

            <Suspense
              fallback={
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-[var(--text-muted)]">
                  <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)]/25 border-t-[var(--primary)]" />
                  جاري تجهيز المساعد...
                </div>
              }
            >
              <div className="flex min-h-0 flex-1 flex-col">
                <AssistantPanel onClose={() => setOpen(false)} />
              </div>
            </Suspense>
          </div>
        )}

        {!open && hint && (
          <div
            className={cn(
              'pointer-events-auto mb-1 max-w-[16rem] rounded-2xl border border-[var(--border)]',
              'bg-[var(--bg-card)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--text)]',
              'shadow-lg animate-[assistant-rise_220ms_ease-out]',
            )}
          >
            <p className="font-semibold text-[var(--primary)]">هل تحتاج مساعدة؟</p>
            <p className="mt-0.5 text-[var(--text-muted)]">اسأل عن استخدام موبي شوب أو ملخص متجرك.</p>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v)
            setHint(false)
            sessionStorage.setItem('mobishop_assistant_hint', '1')
          }}
          aria-expanded={open}
          aria-controls={open ? titleId : undefined}
          aria-label={open ? 'إغلاق المساعد' : 'فتح مساعد موبي شوب الذكي'}
          className={cn(
            'pointer-events-auto group relative flex items-center gap-2.5 rounded-full',
            'bg-gradient-to-l from-[#1e3a8a] to-[var(--primary)] text-white',
            'shadow-[0_12px_32px_-8px_rgb(37_99_235/0.6)]',
            'transition-all duration-200 hover:brightness-110 hover:shadow-[0_16px_36px_-8px_rgb(37_99_235/0.7)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2',
            'self-start',
            open ? 'h-12 w-12 justify-center' : 'h-14 pl-3.5 pr-5',
          )}
        >
          {!open && (
            <span
              className="absolute inset-0 -z-10 animate-ping rounded-full bg-[var(--primary)]/30"
              style={{ animationDuration: '2.6s' }}
              aria-hidden
            />
          )}
          {open ? (
            <X className="h-5 w-5" />
          ) : (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
                <MessageCircle className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold whitespace-nowrap">المساعد الذكي</span>
            </>
          )}
        </button>
      </div>
    </div>
  )

  return createPortal(widget, document.body)
}
