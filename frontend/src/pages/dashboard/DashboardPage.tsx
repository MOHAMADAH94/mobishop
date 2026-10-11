import { useEffect, useRef, useState } from 'react'

import { Link } from 'react-router-dom'

import { TrendingUp, Package, AlertTriangle, Receipt, Wrench, Users, Warehouse, Wallet, CalendarDays } from 'lucide-react'

import { api, getErrorMessage } from '../../api/client'

import { Button } from '../../components/ui/Button'

import { Card } from '../../components/ui/Card'

import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'

import { useToastStore } from '../../stores/toastStore'

import { formatMoney, formatNumber } from '../../lib/utils'

import {

  currentMonthStr,

  formatDayLabel,

  formatMonthLabel,

  localDateStr,

} from '../../lib/dashboardDates'

import { ProductStatsPanel } from '../../components/dashboard/ProductStatsPanel'
import { DecisionCenterWidget } from '../../components/dashboard/DecisionCenterWidget'
import { DashboardChart } from '../../components/dashboard/DashboardChart'
import { LazySection } from '../../components/ui/LazySection'

import type { DashboardStats } from '../../types'



function StatCard({

  title,

  value,

  subtitle,

  icon: Icon,

  accent,

  filter,

}: {

  title: string

  value: string

  subtitle?: React.ReactNode

  icon: React.ElementType

  accent: string

  filter?: React.ReactNode

}) {

  return (

    <Card className="relative overflow-hidden">

      <div className={`absolute left-0 top-0 h-1 w-full ${accent}`} />

      <div className="flex items-start justify-between gap-2">

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center justify-between gap-2">

            <p className="text-sm text-[var(--text-muted)]">{title}</p>

            {filter}

          </div>

          <p className="mt-2 text-2xl font-bold">{value}</p>

          {subtitle && <p className="mt-1 text-xs text-[var(--text-muted)]">{subtitle}</p>}

        </div>

        <div className="shrink-0 rounded-xl bg-[var(--bg-muted)] p-3">

          <Icon className="h-6 w-6 text-[var(--primary)]" />

        </div>

      </div>

    </Card>

  )

}



export function DashboardPage() {

  const store = useCurrentStore()

  const storeVersion = useStoreVersion()

  const toast = useToastStore((s) => s.add)

  const [stats, setStats] = useState<DashboardStats | null>(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const hadStats = useRef(false)

  const [error, setError] = useState<string | null>(null)

  const [reloadNonce, setReloadNonce] = useState(0)

  const [selectedDay, setSelectedDay] = useState(localDateStr())

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr())

  const reportCurrency = stats?.base_currency || store?.currency


  useEffect(() => {

    if (!store) {

      setLoading(false)

      setStats(null)

      return

    }

    setError(null)
    if (hadStats.current) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    api
      .get<DashboardStats>('/dashboard/stats/', {
        params: { day: selectedDay, month: selectedMonth },
      })
      .then(({ data }) => {
        hadStats.current = true
        setStats(data)
      })

      .catch((e) => {

        const msg = getErrorMessage(e)

        setError(msg)

        toast(msg, 'error')

      })

      .finally(() => {
        setLoading(false)
        setRefreshing(false)
      })

  }, [store?.id, storeVersion, reloadNonce, selectedDay, selectedMonth])



  if (!store) {

    return (

      <p className="py-12 text-center text-[var(--text-muted)]">اختر متجراً من القائمة أعلاه</p>

    )

  }



  if (loading && !stats) {

    return (

      <div className="flex h-64 items-center justify-center">

        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />

      </div>

    )

  }



  if (!stats) {

    return (

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">

        <p className="text-[var(--danger)]">{error || 'تعذر تحميل لوحة التحكم'}</p>

        <Button className="mt-4" onClick={() => setReloadNonce((n) => n + 1)}>

          إعادة المحاولة

        </Button>

      </div>

    )

  }



  const dayLabel = formatDayLabel(selectedDay)

  const monthLabel = formatMonthLabel(selectedMonth)

  const dayPicker = (

    <input

      type="date"

      value={selectedDay}

      onChange={(e) => e.target.value && setSelectedDay(e.target.value)}

      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs"

      title="اختر اليوم"

    />

  )



  const monthPicker = (

    <input

      type="month"

      value={selectedMonth}

      onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}

      className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs"

      title="اختر الشهر"

    />

  )



  return (

    <div className={`space-y-6 transition-opacity ${refreshing ? 'opacity-70' : ''}`}>

      <div className="flex flex-wrap items-end justify-between gap-4">

        <div>

          <h1 className="text-2xl font-bold">لوحة التحكم</h1>

          <p className="text-[var(--text-muted)]">{store?.name}</p>

        </div>

        <Card className="flex flex-wrap items-center gap-4 px-4 py-3">

          <CalendarDays className="h-5 w-5 text-[var(--primary)]" />

          <div>

            <label className="mb-1 block text-xs text-[var(--text-muted)]">اليوم</label>

            <input

              type="date"

              value={selectedDay}

              onChange={(e) => e.target.value && setSelectedDay(e.target.value)}

              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"

            />

          </div>

          <div>

            <label className="mb-1 block text-xs text-[var(--text-muted)]">الشهر</label>

            <input

              type="month"

              value={selectedMonth}

              onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}

              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"

            />

          </div>

        </Card>

      </div>



      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard

          title={`إيراد ${dayLabel}`}

          value={formatMoney(stats.today_total, reportCurrency)}

          subtitle={`مبيعات ${formatMoney(stats.today_sales, reportCurrency)} + صيانة ${formatMoney(stats.today_repairs, reportCurrency)}`}

          icon={TrendingUp}

          accent="bg-emerald-500"

          filter={dayPicker}

        />

        <StatCard

          title={`صافي ربح ${dayLabel}`}

          value={formatMoney(stats.today_net_profit ?? stats.today_profit, reportCurrency)}

          subtitle={`إجمالي ${formatMoney(stats.today_profit, reportCurrency)} − مصاريف ${formatMoney(stats.today_expenses || '0', reportCurrency)}`}

          icon={TrendingUp}

          accent="bg-teal-500"

          filter={dayPicker}

        />

        <StatCard

          title={`إيراد ${monthLabel}`}

          value={formatMoney(stats.month_total, reportCurrency)}

          subtitle={`مبيعات ${formatMoney(stats.month_sales, reportCurrency)} + صيانة ${formatMoney(stats.month_repairs, reportCurrency)}`}

          icon={Receipt}

          accent="bg-blue-500"

          filter={monthPicker}

        />

        <StatCard

          title={`صافي ربح ${monthLabel}`}

          value={formatMoney(stats.month_net_profit ?? stats.month_profit, reportCurrency)}

          subtitle={`إجمالي ${formatMoney(stats.month_profit, reportCurrency)} − مصاريف ${formatMoney(stats.month_expenses || '0', reportCurrency)}`}

          icon={Receipt}

          accent="bg-cyan-500"

          filter={monthPicker}

        />

      </div>



      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        <StatCard

          title={`مصاريف ${monthLabel}`}

          value={formatMoney(stats.month_expenses || '0', reportCurrency)}

          subtitle={

            <>

              يوم {selectedDay}: {formatMoney(stats.today_expenses || '0', reportCurrency)} ·{' '}

              <Link to="/expenses" className="text-[var(--primary)] hover:underline">إدارة المصاريف</Link>

            </>

          }

          icon={Wallet}

          accent="bg-rose-500"

          filter={monthPicker}

        />

        <StatCard

          title="صيانة — تذاكر مفتوحة"

          value={formatNumber(stats.open_repairs_count)}

          subtitle={`قيمة ${formatMoney(stats.open_repairs_value, reportCurrency)} · عربون ${monthLabel}: ${formatMoney(stats.month_deposits, reportCurrency)}`}

          icon={Wrench}

          accent="bg-orange-500"

          filter={monthPicker}

        />

        <StatCard

          title="ديون العملاء"

          value={formatMoney(stats.total_customer_debt, reportCurrency)}

          subtitle={`${formatNumber(stats.month_invoices)} فاتورة في ${monthLabel}`}

          icon={Users}

          accent="bg-violet-500"

          filter={monthPicker}

        />

        <StatCard

          title="رأس مال المخزون"

          value={formatMoney(stats.inventory_cost_value, reportCurrency)}

          subtitle={

            parseFloat(stats.inventory_cost_value || '0') === 0 && stats.total_products > 0

              ? 'أدخل سعر الشراء للمنتجات لحساب رأس المال'

              : `قيمة بيع محتملة ${formatMoney(stats.inventory_sell_value, reportCurrency)} · ${formatNumber(stats.total_products)} منتج`

          }

          icon={Warehouse}

          accent="bg-indigo-500"

        />

        <StatCard

          title="منتجات منخفضة"

          value={formatNumber(stats.low_stock_count)}

          icon={AlertTriangle}

          accent="bg-amber-500"

        />

        <StatCard

          title={`فواتير ${monthLabel}`}

          value={formatNumber(stats.month_invoices)}

          subtitle={`${formatNumber(stats.today_invoices)} فاتورة في ${dayLabel}`}

          icon={Package}

          accent="bg-slate-500"

          filter={monthPicker}

        />

      </div>



      <DashboardChart stats={stats} selectedMonth={selectedMonth} monthPicker={monthPicker} />



      <LazySection>
        <DecisionCenterWidget />
      </LazySection>

      <LazySection>
        <ProductStatsPanel
          storeId={store.id}
          storeVersion={storeVersion}
          currency={store.currency}
          syncMonth={selectedMonth}
          defaultLimit={5}
        />
      </LazySection>

    </div>

  )

}

