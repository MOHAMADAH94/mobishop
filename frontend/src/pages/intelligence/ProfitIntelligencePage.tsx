import { useCallback, useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { TrendingUp, FileSpreadsheet, FileText, DollarSign } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { useAuthStore } from '../../stores/authStore'
import { useStoreVersion } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import { formatMoney, formatNumber } from '../../lib/utils'
import type {
  ProfitDashboard,
  ProfitBreakdown,
  ProfitTrends,
  ProfitProductRow,
  ProfitCategoryRow,
  ProfitEmployeeRow,
  ProfitSupplierRow,
} from '../../types'

function exportFile(url: string, filename: string) {
  const token = useAuthStore.getState().accessToken
  const storeId = useAuthStore.getState().currentStoreId
  fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000/api'}${url}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(storeId ? { 'X-Store-Id': String(storeId) } : {}),
    },
  })
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
    })
}

export function ProfitIntelligencePage() {
  const currency = useAuthStore((s) => s.currentStore()?.currency)
  const storeVersion = useStoreVersion()
  const toast = useToastStore((s) => s.add)
  const [dashboard, setDashboard] = useState<ProfitDashboard | null>(null)
  const [breakdown, setBreakdown] = useState<ProfitBreakdown | null>(null)
  const [trends, setTrends] = useState<ProfitTrends | null>(null)
  const [products, setProducts] = useState<ProfitProductRow[]>([])
  const [categories, setCategories] = useState<ProfitCategoryRow[]>([])
  const [employees, setEmployees] = useState<ProfitEmployeeRow[]>([])
  const [suppliers, setSuppliers] = useState<ProfitSupplierRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      api.get<ProfitDashboard>('/intelligence/profit/dashboard/'),
      api.get<ProfitBreakdown>('/intelligence/profit/breakdown/', { params: { period } }),
      api.get<ProfitTrends>('/intelligence/profit/trends/', { params: { days: 30 } }),
      api.get<{ products: ProfitProductRow[] }>('/intelligence/profit/products/', { params: { limit: 20 } }),
      api.get<{ categories: ProfitCategoryRow[] }>('/intelligence/profit/categories/'),
      api.get<{ employees: ProfitEmployeeRow[] }>('/intelligence/profit/employees/'),
      api.get<{ suppliers: ProfitSupplierRow[] }>('/intelligence/profit/suppliers/'),
    ])
      .then(([dash, br, tr, prod, cat, emp, sup]) => {
        setDashboard(dash.data)
        setBreakdown(br.data)
        setTrends(tr.data)
        setProducts(prod.data.products)
        setCategories(cat.data.categories)
        setEmployees(emp.data.employees)
        setSuppliers(sup.data.suppliers)
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setLoading(false))
  }, [period, toast])

  useEffect(() => {
    load()
  }, [load, storeVersion])

  const chartData = trends?.trends.map((t) => ({
    date: t.date.slice(5),
    net_profit: parseFloat(t.net_profit),
    revenue: parseFloat(t.revenue),
  })) ?? []

  const breakdownData = breakdown?.segments.map((s) => ({
    name: s.label,
    profit: parseFloat(s.profit),
    revenue: parseFloat(s.revenue),
  })) ?? []

  if (loading && !dashboard) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const periods = [
    { key: 'today', label: 'اليوم', data: dashboard?.today },
    { key: 'week', label: 'الأسبوع', data: dashboard?.week },
    { key: 'month', label: 'الشهر', data: dashboard?.month },
    { key: 'year', label: 'السنة', data: dashboard?.year },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-[var(--text-muted)]">
          رؤية الربح الفعلي: الإيرادات − التكلفة − المصاريف = صافي الربح
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => exportFile('/intelligence/profit/export/excel/', 'profit_report.xlsx')}
          >
            <FileSpreadsheet className="ml-2 h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => exportFile('/intelligence/profit/export/pdf/', 'profit_report.pdf')}
          >
            <FileText className="ml-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {periods.map(({ key, label, data }) => (
          <Card key={key} className="relative overflow-hidden">
            <div className="absolute left-0 top-0 h-1 w-full bg-emerald-500" />
            <p className="text-sm text-[var(--text-muted)]">صافي ربح {label}</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {formatMoney(data?.net_profit ?? '0', currency)}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              إيرادات: {formatMoney(data?.revenue ?? '0', currency)} | مصاريف: {formatMoney(data?.expenses ?? '0', currency)}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              اتجاه الأرباح (30 يوم)
            </CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="net_profit" name="صافي الربح" stroke="#059669" fill="#05966933" />
              <Area type="monotone" dataKey="revenue" name="الإيرادات" stroke="#2563eb" fill="#2563eb22" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              توزيع الأرباح
            </CardTitle>
            <div className="mt-2 flex gap-2">
              {['month', 'week', 'year'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded px-2 py-1 text-xs ${
                    period === p ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-muted)]'
                  }`}
                >
                  {p === 'month' ? 'شهر' : p === 'week' ? 'أسبوع' : 'سنة'}
                </button>
              ))}
            </div>
          </CardHeader>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={breakdownData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="profit" name="الربح" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>ربحية المنتجات</CardTitle></CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-[var(--text-muted)]">
                <th className="px-4 py-2 text-right">المنتج</th>
                <th className="px-4 py-2 text-right">الإيرادات</th>
                <th className="px-4 py-2 text-right">التكلفة</th>
                <th className="px-4 py-2 text-right">الربح</th>
                <th className="px-4 py-2 text-right">الهامش %</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.product_id ?? p.name} className="border-b hover:bg-[var(--bg-muted)]">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{formatMoney(p.revenue, currency)}</td>
                  <td className="px-4 py-2">{formatMoney(p.cost, currency)}</td>
                  <td className="px-4 py-2 text-emerald-600">{formatMoney(p.gross_profit, currency)}</td>
                  <td className="px-4 py-2">{p.margin_percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>ربحية التصنيفات</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[var(--text-muted)]">
                  <th className="px-4 py-2 text-right">التصنيف</th>
                  <th className="px-4 py-2 text-right">الربح</th>
                  <th className="px-4 py-2 text-right">الهامش</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category_id ?? c.name} className="border-b">
                    <td className="px-4 py-2">{c.name}</td>
                    <td className="px-4 py-2">{formatMoney(c.profit, currency)}</td>
                    <td className="px-4 py-2">{c.margin_percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>ربحية الموظفين</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[var(--text-muted)]">
                  <th className="px-4 py-2 text-right">الموظف</th>
                  <th className="px-4 py-2 text-right">الفواتير</th>
                  <th className="px-4 py-2 text-right">الربح</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.user_id ?? e.name} className="border-b">
                    <td className="px-4 py-2">{e.name}</td>
                    <td className="px-4 py-2">{formatNumber(e.sales_count)}</td>
                    <td className="px-4 py-2">{formatMoney(e.profit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {suppliers.length > 0 && (
        <Card>
          <CardHeader><CardTitle>تحليل الموردين</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[var(--text-muted)]">
                  <th className="px-4 py-2 text-right">المورد</th>
                  <th className="px-4 py-2 text-right">المشتريات</th>
                  <th className="px-4 py-2 text-right">متوسط التكلفة</th>
                  <th className="px-4 py-2 text-right">ربح المبيعات</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.supplier_id} className="border-b">
                    <td className="px-4 py-2">{s.name}</td>
                    <td className="px-4 py-2">{formatMoney(s.purchase_total, currency)}</td>
                    <td className="px-4 py-2">{formatMoney(s.avg_unit_cost, currency)}</td>
                    <td className="px-4 py-2">{formatMoney(s.related_sales_profit, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
