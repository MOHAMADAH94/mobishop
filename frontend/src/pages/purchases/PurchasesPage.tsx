import { useEffect, useState } from 'react'
import { FileText, XCircle, Eye, Wallet, Search } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { TableScroll } from '../../components/ui/TableScroll'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { hasPermission } from '../../lib/permissions'
import { formatMoney, formatDate } from '../../lib/utils'
import { Pagination } from '../../components/ui/Pagination'
import type { Paginated, Purchase, PurchaseItem } from '../../types'

const statusLabels: Record<string, string> = {
  completed: 'مكتمل',
  cancelled: 'ملغي',
}

const paymentLabels: Record<string, string> = {
  cash: 'نقدي',
  electronic: 'إلكتروني',
  partial: 'جزئي',
}

export function PurchasesPage() {
  const store = useAuthStore((s) => s.currentStore())
  const currency = store?.currency
  const canCancel = hasPermission(store?.role, 'purchases_cancel')
  const toast = useToastStore((s) => s.add)
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Purchase | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payLoading, setPayLoading] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = { page: String(page) }
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get<Paginated<Purchase>>('/purchases/', { params })
      setPurchases(data.results)
      setTotalCount(data.count)
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search, page])

  const openDetail = async (id: number) => {
    setLoadingDetail(true)
    try {
      const { data } = await api.get<Purchase>(`/purchases/${id}/`)
      setSelected(data)
      setPayAmount(data.amount_due || '')
      setPayMethod('cash')
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  const cancelPurchase = async (id: number) => {
    if (!confirm('إلغاء فاتورة الشراء وخصم الكميات من المخزون؟')) return
    try {
      await api.post(`/purchases/${id}/cancel/`)
      toast('تم إلغاء فاتورة الشراء', 'success')
      setSelected(null)
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    }
  }

  const submitPayment = async () => {
    if (!selected) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'error')
      return
    }
    setPayLoading(true)
    try {
      const { data } = await api.post<Purchase>(`/purchases/${selected.id}/record-payment/`, {
        amount,
        method: payMethod,
      })
      setSelected(data)
      toast('تم تسجيل الدفعة وتحديث حساب المورد', 'success')
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setPayLoading(false)
    }
  }

  const amountDue = selected ? parseFloat(selected.amount_due || '0') : 0
  const canPay = selected && amountDue > 0 && selected.status !== 'cancelled'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">فواتير الشراء</h1>
      <Card>
        <div className="relative mb-4 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="بحث برقم الفاتورة، اسم المورد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        {loading ? (
          <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search.trim() ? 'لا توجد نتائج' : 'لا توجد فواتير شراء'}
            description={search.trim() ? 'جرّب كلمات بحث مختلفة' : 'ابدأ من صفحة إدخال المشتريات'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-3 text-right">رقم الفاتورة</th>
                  <th className="py-3 text-right">المورد</th>
                  <th className="py-3 text-right">الإجمالي</th>
                  <th className="py-3 text-right">المدفوع</th>
                  <th className="py-3 text-right">الحالة</th>
                  <th className="py-3 text-right">التاريخ</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer border-b border-[var(--border)]/50 hover:bg-[var(--bg-muted)]/60"
                    onClick={() => openDetail(p.id)}
                  >
                    <td className="py-3 font-mono font-medium">{p.invoice_number}</td>
                    <td className="py-3">{p.supplier_name || '—'}</td>
                    <td className="py-3">{formatMoney(p.total, currency)}</td>
                    <td className="py-3">{formatMoney(p.amount_paid, currency)}</td>
                    <td className="py-3">
                      <Badge variant={p.status === 'completed' ? 'success' : 'danger'}>
                        {statusLabels[p.status] || p.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-[var(--text-muted)]">{formatDate(p.created_at)}</td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => openDetail(p.id)} title="عرض">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} totalCount={totalCount} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `فاتورة شراء ${selected.invoice_number}` : ''}
        size="xl"
      >
        {loadingDetail ? (
          <p className="py-8 text-center">جاري التحميل...</p>
        ) : selected ? (
          <div className="space-y-6">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-[var(--text-muted)]">المورد: </span>{selected.supplier_name || '—'}</div>
              <div><span className="text-[var(--text-muted)]">الدفع: </span>{paymentLabels[selected.payment_method]}</div>
              <div><span className="text-[var(--text-muted)]">التاريخ: </span>{formatDate(selected.created_at)}</div>
              <div><span className="text-[var(--text-muted)]">الحالة: </span>{statusLabels[selected.status]}</div>
            </div>

            <div>
              <h4 className="mb-2 font-semibold">محتويات الفاتورة</h4>
              <TableScroll>
                <table className="w-full min-w-0 table-fixed text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    <th className="py-2 text-right">المنتج</th>
                    <th className="py-2 text-right">الكمية</th>
                    <th className="py-2 text-right">سعر الشراء</th>
                    <th className="py-2 text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items?.map((item: PurchaseItem) => (
                    <tr key={item.id} className="border-b border-[var(--border)]/40">
                      <td className="break-words py-2">{item.product_name}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="whitespace-nowrap py-2">{formatMoney(item.unit_cost, currency)}</td>
                      <td className="whitespace-nowrap py-2">{formatMoney(item.line_total, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
            </div>

            <div className="rounded-xl bg-[var(--bg-muted)] p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>المجموع</span><span>{formatMoney(selected.subtotal || 0, currency)}</span></div>
              <div className="flex justify-between"><span>الخصم</span><span>{formatMoney(selected.discount || 0, currency)}</span></div>
              <div className="flex justify-between"><span>الضريبة</span><span>{formatMoney(selected.tax_amount || 0, currency)}</span></div>
              <div className="flex justify-between font-bold"><span>الإجمالي</span><span>{formatMoney(selected.total, currency)}</span></div>
              <div className="flex justify-between"><span>المدفوع</span><span>{formatMoney(selected.amount_paid, currency)}</span></div>
              {amountDue > 0 && (
                <div className="flex justify-between font-bold text-amber-600">
                  <span>المتبقي على الفاتورة</span>
                  <span>{formatMoney(amountDue, currency)}</span>
                </div>
              )}
            </div>

            {selected.payments && selected.payments.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">دفعات لاحقة</h4>
                {selected.payments.map((p) => (
                  <div key={p.id} className="mb-2 flex justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                    <span>{formatDate(p.created_at)} — {paymentLabels[p.method] || p.method}</span>
                    <span className="font-medium text-emerald-600">{formatMoney(p.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}

            {canPay && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4" />
                  إكمال الدفع (متبقي {formatMoney(amountDue, currency)})
                </h4>
                <div className="flex flex-wrap gap-3">
                  <Input
                    label="المبلغ"
                    type="number"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="min-w-[140px] flex-1"
                  />
                  <div className="min-w-[120px]">
                    <label className="mb-1 block text-sm text-[var(--text-muted)]">طريقة الدفع</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
                    >
                      <option value="cash">نقدي</option>
                      <option value="electronic">إلكتروني</option>
                    </select>
                  </div>
                  <Button onClick={submitPayment} loading={payLoading} className="self-end">
                    تسجيل الدفعة
                  </Button>
                </div>
              </div>
            )}

            {canCancel && selected.status !== 'cancelled' && (
              <Button variant="danger" onClick={() => cancelPurchase(selected.id)}>
                <XCircle className="h-4 w-4" />
                إلغاء الفاتورة وخصم المخزون
              </Button>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
