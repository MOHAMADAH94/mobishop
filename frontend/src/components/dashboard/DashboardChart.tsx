import { lazy, Suspense } from 'react'
import type { DashboardStats } from '../../types'
import { formatDateShort } from '../../lib/utils'
import { formatMonthLabel } from '../../lib/dashboardDates'

const DashboardChartInner = lazy(() =>
  import('./DashboardChartInner').then((m) => ({ default: m.DashboardChartInner })),
)

export function DashboardChart({
  stats,
  selectedMonth,
  monthPicker,
}: {
  stats: DashboardStats
  selectedMonth: string
  monthPicker: React.ReactNode
}) {
  const chartData = stats.daily_sales.map((d) => ({
    date: formatDateShort(d.date),
    مبيعات: parseFloat(d.sales_total),
    صيانة: parseFloat(d.repairs_total),
    مصاريف: parseFloat(d.expenses_total || '0'),
    الإجمالي: parseFloat(d.total),
  }))

  return (
    <Suspense
      fallback={
        <div className="flex h-72 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
        </div>
      }
    >
      <DashboardChartInner
        chartData={chartData}
        monthLabel={formatMonthLabel(selectedMonth)}
        monthPicker={monthPicker}
      />
    </Suspense>
  )
}
