import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, Filter } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { EmptyState } from '../../components/ui/EmptyState'
import { Pagination } from '../../components/ui/Pagination'
import { useToastStore } from '../../stores/toastStore'
import { formatDate } from '../../lib/utils'
import { formatQtyDisplay } from '../../lib/quantity'
import type { Paginated } from '../../types'

interface Log {
  id: number
  product_name: string
  action: string
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference: string
  created_by_name: string
  created_at: string
}

const actionLabels: Record<string, string> = {
  add: 'إضافة',
  remove: 'حذف',
  sale: 'بيع',
  adjust: 'تعديل',
  return: 'مرتجع',
  purchase: 'شراء',
}

const actionVariant: Record<string, 'success' | 'danger' | 'primary' | 'warning'> = {
  add: 'success',
  remove: 'danger',
  sale: 'primary',
  adjust: 'warning',
  return: 'success',
  purchase: 'success',
}

export function InventoryPage() {
  const toast = useToastStore((s) => s.add)
  const [logs, setLogs] = useState<Log[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [action, setAction] = useState('')
  const [applied, setApplied] = useState({ dateFrom: '', dateTo: '', action: '' })

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page) }
    if (applied.dateFrom) params.date_from = applied.dateFrom
    if (applied.dateTo) params.date_to = applied.dateTo
    if (applied.action) params.action = applied.action
    api
      .get<Paginated<Log>>('/products/inventory-logs/', { params })
      .then(({ data }) => {
        setLogs(data.results)
        setTotalCount(data.count)
      })
      .catch((e) => toast(getErrorMessage(e), 'error'))
      .finally(() => setLoading(false))
  }, [applied, page, toast])

  const applyFilters = () => {
    setPage(1)
    setApplied({ dateFrom, dateTo, action })
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
    setAction('')
    setPage(1)
    setApplied({ dateFrom: '', dateTo: '', action: '' })
  }

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">سجل المخزون</h1>
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Input
            label="من تاريخ"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-auto min-w-[160px]"
          />
          <Input
            label="إلى تاريخ"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-auto min-w-[160px]"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium">نوع العملية</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm"
            >
              <option value="">الكل</option>
              {Object.entries(actionLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Button onClick={applyFilters}>
            <Filter className="h-4 w-4" />
            تطبيق
          </Button>
          <Button variant="secondary" onClick={clearFilters}>مسح</Button>
        </div>
        {loading ? (
          <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
        ) : logs.length === 0 ? (
          <EmptyState icon={ClipboardList} title="لا توجد حركات" description="جرّب تغيير نطاق التاريخ" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-3 text-right">المنتج</th>
                  <th className="py-3 text-right">العملية</th>
                  <th className="py-3 text-right">التغيير</th>
                  <th className="py-3 text-right">قبل / بعد</th>
                  <th className="py-3 text-right">المرجع</th>
                  <th className="py-3 text-right">بواسطة</th>
                  <th className="py-3 text-right">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--border)]/50">
                    <td className="py-3">{log.product_name}</td>
                    <td className="py-3">
                      <Badge variant={actionVariant[log.action] || 'default'}>
                        {actionLabels[log.action] || log.action}
                      </Badge>
                    </td>
                    <td className="py-3 font-mono">
                      {(() => {
                        const change = Number(log.quantity_change)
                        const sign = change > 0 ? '+' : change < 0 ? '−' : ''
                        return (
                          sign +
                          formatQtyDisplay(Math.abs(change), {
                            allowFractional: true,
                            precision: 3,
                          })
                        )
                      })()}
                    </td>
                    <td className="py-3 text-[var(--text-muted)]">
                      {formatQtyDisplay(log.quantity_before, { allowFractional: true, precision: 3 })}
                      {' → '}
                      {formatQtyDisplay(log.quantity_after, { allowFractional: true, precision: 3 })}
                    </td>
                    <td className="py-3">{log.reference || '—'}</td>
                    <td className="py-3">{log.created_by_name}</td>
                    <td className="py-3 text-[var(--text-muted)]">{formatDate(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalCount={totalCount} onPageChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  )
}
