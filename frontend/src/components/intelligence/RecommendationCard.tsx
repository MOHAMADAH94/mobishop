import { AlertTriangle, Lightbulb, TrendingUp, X, ArrowLeft } from 'lucide-react'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { cn } from '../../lib/utils'
import type { BusinessRecommendation } from '../../types'

type CardStyle = {
  card: string
  iconWrap: string
  accent: string
  actionBg: string
  border: string
}

const kindConfig = {
  recommendation: {
    icon: Lightbulb,
    label: 'توصية',
    card: 'border-blue-200/80 bg-gradient-to-l from-blue-50/90 to-[var(--bg-card)] dark:border-blue-900/50 dark:from-blue-950/40',
    iconWrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    accent: 'border-blue-400 dark:border-blue-500',
    actionBg: 'bg-blue-500/5 dark:bg-blue-500/10',
    border: 'border-r-blue-400',
  },
  opportunity: {
    icon: TrendingUp,
    label: 'فرصة',
    card: 'border-emerald-200/80 bg-gradient-to-l from-emerald-50/90 to-[var(--bg-card)] dark:border-emerald-900/50 dark:from-emerald-950/40',
    iconWrap: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    accent: 'border-emerald-400 dark:border-emerald-500',
    actionBg: 'bg-emerald-500/5 dark:bg-emerald-500/10',
    border: 'border-r-emerald-500',
  },
} as const

const alertSeverityStyle: Record<string, CardStyle> = {
  critical: {
    card: 'border-red-200/80 bg-gradient-to-l from-red-50/90 to-[var(--bg-card)] dark:border-red-900/50 dark:from-red-950/40',
    iconWrap: 'bg-red-500/15 text-red-600 dark:text-red-400',
    accent: 'border-red-500 dark:border-red-400',
    actionBg: 'bg-red-500/8 dark:bg-red-500/12',
    border: 'border-r-red-500',
  },
  warning: {
    card: 'border-amber-200/80 bg-gradient-to-l from-amber-50/90 to-[var(--bg-card)] dark:border-amber-900/50 dark:from-amber-950/35',
    iconWrap: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    accent: 'border-amber-500 dark:border-amber-400',
    actionBg: 'bg-amber-500/8 dark:bg-amber-500/12',
    border: 'border-r-amber-500',
  },
  info: {
    card: 'border-sky-200/80 bg-gradient-to-l from-sky-50/90 to-[var(--bg-card)] dark:border-sky-900/50 dark:from-sky-950/35',
    iconWrap: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
    accent: 'border-sky-400 dark:border-sky-500',
    actionBg: 'bg-sky-500/8 dark:bg-sky-500/12',
    border: 'border-r-sky-400',
  },
}

const severityBadge: Record<string, 'danger' | 'warning' | 'primary'> = {
  critical: 'danger',
  warning: 'warning',
  info: 'primary',
}

function resolveVisuals(rec: BusinessRecommendation) {
  if (rec.kind === 'alert') {
    const style = alertSeverityStyle[rec.severity] ?? alertSeverityStyle.warning
    return { icon: AlertTriangle, label: 'تنبيه', ...style }
  }
  const config = kindConfig[rec.kind as keyof typeof kindConfig] ?? kindConfig.recommendation
  return config
}

export function RecommendationCard({
  rec,
  onDismiss,
  dateLabel,
}: {
  rec: BusinessRecommendation
  onDismiss: (id: number) => void
  dateLabel: string
}) {
  const visuals = resolveVisuals(rec)
  const Icon = visuals.icon

  return (
    <Card
      className={cn(
        'overflow-hidden border border-r-4 shadow-sm transition-shadow hover:shadow-md',
        visuals.card,
        visuals.border,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', visuals.iconWrap)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--text-muted)]">{visuals.label}</span>
              <Badge variant={severityBadge[rec.severity] ?? 'default'}>{rec.severity_display}</Badge>
              <Badge variant="default">{rec.category_display}</Badge>
            </div>
            <h3 className="mt-1 text-base font-semibold leading-snug">{rec.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{rec.reason}</p>
            <div className={cn('mt-3 rounded-xl border-r-4 p-3', visuals.accent, visuals.actionBg)}>
              <p className="flex items-center gap-1 text-xs font-semibold text-[var(--text)]">
                <ArrowLeft className="h-3.5 w-3.5 text-[var(--primary)]" />
                الإجراء المقترح
              </p>
              <p className="mt-1.5 text-sm leading-relaxed">{rec.suggested_action}</p>
            </div>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{dateLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onDismiss(rec.id)}
          className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-black/5 hover:text-[var(--text)] dark:hover:bg-white/10"
          title="تجاهل"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </Card>
  )
}
