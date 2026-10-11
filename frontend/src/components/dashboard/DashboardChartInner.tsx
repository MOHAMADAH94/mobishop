import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { Card, CardHeader, CardTitle } from '../ui/Card'

export function DashboardChartInner({
  chartData,
  monthLabel,
  monthPicker,
}: {
  chartData: Array<Record<string, string | number>>
  monthLabel: string
  monthPicker: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>الإيرادات — {monthLabel}</CardTitle>
        {monthPicker}
      </CardHeader>
      <div className="h-80 sm:h-96">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="repairsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expensesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e11d48" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
            <YAxis stroke="var(--text-muted)" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
              }}
            />
            <Legend />
            <Area type="monotone" dataKey="مبيعات" stroke="#2563eb" fill="url(#salesGrad)" />
            <Area type="monotone" dataKey="صيانة" stroke="#f97316" fill="url(#repairsGrad)" />
            <Area type="monotone" dataKey="مصاريف" stroke="#e11d48" fill="url(#expensesGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
