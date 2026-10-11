import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lightbulb, AlertTriangle, TrendingUp, ChevronLeft } from 'lucide-react'
import { api } from '../../api/client'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { useStoreVersion } from '../../hooks/useCurrentStore'
import { hasPermission } from '../../lib/permissions'
import { useAuthStore } from '../../stores/authStore'
import type { DecisionCenterSummary } from '../../types'

export function DecisionCenterWidget() {
  const storeVersion = useStoreVersion()
  const role = useAuthStore((s) => s.currentStore()?.role)
  const [summary, setSummary] = useState<DecisionCenterSummary | null>(null)
  const [loading, setLoading] = useState(false)

  const canView = hasPermission(role, 'decision_center')

  useEffect(() => {
    if (!canView) return
    setLoading(true)
    api
      .get<DecisionCenterSummary>('/intelligence/decision-center/summary/')
      .then(({ data }) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [canView, storeVersion])

  if (!canView) return null

  if (loading && !summary) {
    return <div className="h-40 animate-pulse rounded-xl bg-[var(--bg-muted)]" />
  }

  if (!summary) return null

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-5 w-5 text-[var(--primary)]" />
          مركز الأعمال الذكي
        </CardTitle>
        <Link
          to="/smart-business/decision-center"
          className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
        >
          عرض الكل
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3 px-4 pb-4">
        <div className="rounded-xl border border-blue-200/60 bg-gradient-to-b from-blue-50/80 to-[var(--bg-card)] p-3 text-center dark:border-blue-900/40 dark:from-blue-950/30">
          <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{summary.total_active}</p>
          <p className="text-xs text-[var(--text-muted)]">توصيات نشطة</p>
        </div>
        <div className="rounded-xl border border-red-200/60 bg-gradient-to-b from-red-50/80 to-[var(--bg-card)] p-3 text-center dark:border-red-900/40 dark:from-red-950/30">
          <p className="flex items-center justify-center gap-1 text-2xl font-bold text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {summary.critical_count}
          </p>
          <p className="text-xs text-[var(--text-muted)]">حرجة</p>
        </div>
        <div className="rounded-xl border border-emerald-200/60 bg-gradient-to-b from-emerald-50/80 to-[var(--bg-card)] p-3 text-center dark:border-emerald-900/40 dark:from-emerald-950/30">
          <p className="flex items-center justify-center gap-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            {summary.opportunities_count}
          </p>
          <p className="text-xs text-[var(--text-muted)]">فرص</p>
        </div>
      </div>
      {summary.critical_count > 0 && (
        <div className="border-t border-red-100 bg-red-50/50 px-4 py-3 dark:border-red-900/30 dark:bg-red-950/20">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {summary.critical_count} تنبيهات حرجة تحتاج اهتمامك
          </p>
        </div>
      )}
    </Card>
  )
}
