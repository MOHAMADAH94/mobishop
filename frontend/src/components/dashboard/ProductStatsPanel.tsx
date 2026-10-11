import { useEffect, useState } from 'react'
import { BarChart3, Filter } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Badge } from '../ui/Badge'
import { useToastStore } from '../../stores/toastStore'
import { formatMoney, formatNumber } from '../../lib/utils'
import { formatMonthLabel, localDateStr, monthRange } from '../../lib/dashboardDates'
import type { ProductStatsResponse } from '../../types'

type SortKey = 'quantity' | 'revenue' | 'profit'
type PeriodKey = 'today' | 'week' | 'month' | 'custom'

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'quantity', label: 'الأكثر مبيعاً' },
  { value: 'revenue', label: 'الأكثر إيراداً' },
  { value: 'profit', label: 'الأكثر ربحاً' },
]

const limitOptions = [5, 10, 20]

function todayStr() {
  return localDateStr()
}

function monthStartStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function weekStartStr() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return localDateStr(d)
}

export function ProductStatsPanel({
  storeId,
  storeVersion,
  currency,
  syncMonth,
  defaultLimit = 10,
}: {
  storeId: number
  storeVersion: number
  currency?: string
  syncMonth?: string
  defaultLimit?: number
}) {
  const toast = useToastStore((s) => s.add)
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [dateFrom, setDateFrom] = useState(monthStartStr())
  const [dateTo, setDateTo] = useState(todayStr())
  const [sort, setSort] = useState<SortKey>('quantity')
  const [limit, setLimit] = useState(defaultLimit)
  const [data, setData] = useState<ProductStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const applyPeriod = (key: PeriodKey) => {
    setPeriod(key)
    const today = todayStr()
    if (key === 'today') {
      setDateFrom(today)
      setDateTo(today)
    } else if (key === 'week') {
      setDateFrom(weekStartStr())
      setDateTo(today)
    } else if (key === 'month') {
      setDateFrom(monthStartStr())
      setDateTo(today)
    }
  }

  const load = () => {
    setLoading(true)
    api
      .get<ProductStatsResponse>('/dashboard/product-stats/', {
        params: { date_from: dateFrom, date_to: dateTo, sort, limit },
      })
      .then(({ data: res }) => setData(res))
      .catch((e) => toast(getErrorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (syncMonth) {
      const { from, to } = monthRange(syncMonth)
      setPeriod('custom')
      setDateFrom(from)
      setDateTo(to)
    }
  }, [syncMonth])

  useEffect(() => {
    load()
  }, [storeId, storeVersion, dateFrom, dateTo, sort, limit])

  const sortLabel = sortOptions.find((o) => o.value === sort)?.label || ''

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          إحصائيات المنتجات
          {syncMonth && period !== 'today' && (
            <span className="text-sm font-normal text-[var(--text-muted)]">
              · {formatMonthLabel(syncMonth)}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <div className="mb-4 flex flex-wrap gap-2">
        {([
          ['today', 'اليوم'],
          ['week', 'هذا الأسبوع'],
          ['month', 'هذا الشهر'],
          ['custom', 'مخصص'],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={period === key ? 'primary' : 'secondary'}
            onClick={() => applyPeriod(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="من تاريخ"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPeriod('custom')
            setDateFrom(e.target.value)
          }}
        />
        <Input
          label="إلى تاريخ"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPeriod('custom')
            setDateTo(e.target.value)
          }}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium">الترتيب حسب</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">عدد النتائج</label>
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
          >
            {limitOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {data && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-[var(--bg-muted)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">منتجات مباعة</p>
            <p className="text-lg font-bold">{formatNumber(data.summary.products_count)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">إجمالي الكمية</p>
            <p className="text-lg font-bold">{formatNumber(data.summary.total_quantity_sold)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">إجمالي الإيراد</p>
            <p className="text-lg font-bold">{formatMoney(data.summary.total_revenue, currency)}</p>
          </div>
          <div className="rounded-xl bg-[var(--bg-muted)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">إجمالي الربح</p>
            <p className="text-lg font-bold text-emerald-600">{formatMoney(data.summary.total_profit, currency)}</p>
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Filter className="h-4 w-4" />
        <span>عرض: {sortLabel}</span>
        {data && (
          <span>· {data.date_from} — {data.date_to}</span>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : !data || data.products.length === 0 ? (
        <p className="py-8 text-center text-[var(--text-muted)]">لا توجد مبيعات في هذه الفترة</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                <th className="py-2 text-right">#</th>
                <th className="py-2 text-right">المنتج</th>
                <th className="py-2 text-right">الكمية</th>
                <th className="py-2 text-right">الإيراد</th>
                <th className="py-2 text-right">الربح</th>
                <th className="py-2 text-right">هامش الربح</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p, i) => (
                <tr key={`${p.product_id ?? p.name}-${i}`} className="border-b border-[var(--border)]/40">
                  <td className="py-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)]/15 text-xs font-bold text-[var(--primary)]">
                      {i + 1}
                    </span>
                  </td>
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2">
                    <Badge variant="primary">{formatNumber(p.quantity_sold)}</Badge>
                  </td>
                  <td className="py-2">{formatMoney(p.revenue, currency)}</td>
                  <td className="py-2 text-emerald-600">{formatMoney(p.profit, currency)}</td>
                  <td className="py-2">{p.margin_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
