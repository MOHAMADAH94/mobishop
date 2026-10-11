import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Lightbulb,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  Info,
} from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { RecommendationCard } from '../../components/intelligence/RecommendationCard'
import { useStoreVersion } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import { formatDateShort } from '../../lib/utils'
import type { BusinessRecommendation, DecisionCenterSummary } from '../../types'

function SummaryCard({
  title,
  value,
  accent,
  icon: Icon,
  iconBg,
}: {
  title: string
  value: number
  accent: string
  icon: React.ElementType
  iconBg: string
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute left-0 top-0 h-1 w-full ${accent}`} />
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        <div className={`rounded-xl p-3 ${iconBg}`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </Card>
  )
}

export function DecisionCenterPage() {
  const storeVersion = useStoreVersion()
  const toast = useToastStore((s) => s.add)
  const [summary, setSummary] = useState<DecisionCenterSummary | null>(null)
  const [allRecommendations, setAllRecommendations] = useState<BusinessRecommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<string>('')
  const [kindFilter, setKindFilter] = useState<string>('')

  const recommendations = useMemo(() => {
    let list = allRecommendations
    if (filter) list = list.filter((r) => r.severity === filter)
    if (kindFilter) list = list.filter((r) => r.kind === kindFilter)
    return list
  }, [allRecommendations, filter, kindFilter])

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<{ summary: DecisionCenterSummary; recommendations: BusinessRecommendation[] }>(
        '/intelligence/decision-center/',
      )
      .then(({ data }) => {
        setSummary(data.summary)
        setAllRecommendations(data.recommendations)
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    load()
  }, [load, storeVersion])

  const handleRefresh = () => {
    setRefreshing(true)
    api
      .post('/intelligence/decision-center/refresh/')
      .then(() => {
        toast('تم تحديث التوصيات', 'success')
        load()
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setRefreshing(false))
  }

  const handleDismiss = (id: number) => {
    api
      .post(`/intelligence/decision-center/recommendations/${id}/dismiss/`)
      .then(() => {
        setAllRecommendations((prev) => prev.filter((r) => r.id !== id))
        if (summary) {
          setSummary({ ...summary, total_active: summary.total_active - 1 })
        }
        toast('تم تجاهل التوصية', 'success')
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--text-muted)]">
          توصيات وتنبيهات تجارية مبنية على بيانات متجرك
        </p>
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`ml-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="توصيات نشطة"
            value={summary.total_active}
            accent="bg-blue-500"
            icon={Lightbulb}
            iconBg="bg-blue-500/15 text-blue-600 dark:text-blue-400"
          />
          <SummaryCard
            title="حرجة"
            value={summary.critical_count}
            accent="bg-red-500"
            icon={AlertTriangle}
            iconBg="bg-red-500/15 text-red-600 dark:text-red-400"
          />
          <SummaryCard
            title="فرص تجارية"
            value={summary.opportunities_count}
            accent="bg-emerald-500"
            icon={TrendingUp}
            iconBg="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          />
          <SummaryCard
            title="تحذيرات"
            value={summary.warning_count}
            accent="bg-amber-500"
            icon={Info}
            iconBg="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          />
        </div>
      )}

      {summary && summary.critical_count > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-gradient-to-l from-red-50 to-[var(--bg-card)] px-4 py-3 dark:border-red-900/50 dark:from-red-950/30">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold text-red-800 dark:text-red-300">
              {summary.critical_count} تنبيهات حرجة تحتاج اهتمامك
            </p>
            <p className="text-xs text-red-700/80 dark:text-red-400/80">
              راجع التنبيهات الحرجة أدناه واتخذ الإجراء المناسب
            </p>
          </div>
        </div>
      )}

      {summary?.last_generated_at && (
        <p className="text-xs text-[var(--text-muted)]">
          آخر توليد: {formatDateShort(summary.last_generated_at)}
        </p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">تصفية حسب النوع</p>
        <div className="flex flex-wrap gap-2">
          {[
            { value: '', label: 'الكل' },
            { value: 'alert', label: 'تنبيهات' },
            { value: 'recommendation', label: 'توصيات' },
            { value: 'opportunity', label: 'فرص' },
          ].map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setKindFilter(f.value)}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                kindFilter === f.value
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--bg-muted)] hover:bg-[var(--border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { value: '', label: 'كل الأولويات' },
          { value: 'critical', label: 'حرج', active: 'bg-red-600 text-white' },
          { value: 'warning', label: 'تحذير', active: 'bg-amber-500 text-white' },
          { value: 'info', label: 'معلومة', active: 'bg-sky-600 text-white' },
        ].map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filter === f.value
                ? f.active ?? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--bg-muted)] hover:bg-[var(--border)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && !summary ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
        </div>
      ) : recommendations.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="لا توجد توصيات"
          description="متجرك في حالة جيدة — أو اضغط تحديث لإعادة التحليل"
        />
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              rec={rec}
              onDismiss={handleDismiss}
              dateLabel={formatDateShort(rec.generated_at)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
