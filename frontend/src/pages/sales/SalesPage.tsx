import { useEffect, useState } from 'react'
import { FileText, Download, XCircle, RotateCcw, Eye, Wallet, Search } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { downloadPdfSafe } from '../../lib/downloadPdf'
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
import type { Paginated, Sale, SaleItem } from '../../types'

const statusLabels: Record<string, string> = {
  completed: 'مكتمل',
  partially_returned: 'مرتجع جزئي',
  cancelled: 'ملغي',
}

const paymentLabels: Record<string, string> = {
  cash: 'نقدي',
  electronic: 'إلكتروني',
  card: 'إلكتروني',
  partial: 'جزئي',
}

export function SalesPage() {
  const store = useAuthStore((s) => s.currentStore())
  const defaultCurrency = store?.currency
  const saleCurrency = (s: Sale) => s.currency || defaultCurrency
  const canCancel = hasPermission(store?.role, 'sales_cancel')
  const canReturn = hasPermission(store?.role, 'sales_return')
  const toast = useToastStore((s) => s.add)
  const [sales, setSales] = useState<Sale[]>([])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Sale | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [returnQty, setReturnQty] = useState<Record<number, string>>({})
  const [returnNotes, setReturnNotes] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)
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
      const { data } = await api.get<Paginated<Sale>>('/sales/', { params })
      setSales(data.results)
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
      const { data } = await api.get<Sale>(`/sales/${id}/`)
      setSelected(data)
      const initial: Record<number, string> = {}
      data.items?.forEach((item) => {
        if (item.quantity_available_to_return > 0) initial[item.id] = ''
      })
      setReturnQty(initial)
      setReturnNotes('')
      setPayAmount(data.amount_due || '')
      setPayMethod('cash')
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setLoadingDetail(false)
    }
  }

  const submitPartialReturn = async () => {
    if (!selected) return
    const items = Object.entries(returnQty)
      .filter(([, q]) => q && parseInt(q, 10) > 0)
      .map(([sale_item_id, quantity]) => ({
        sale_item_id: parseInt(sale_item_id, 10),
        quantity: parseInt(quantity, 10),
      }))
    if (items.length === 0) {
      toast('حدد كمية مرتجع لمنتج واحد على الأقل', 'error')
      return
    }
    setReturnLoading(true)
    try {
      const { data } = await api.post(`/sales/${selected.id}/partial-return/`, {
        items,
        notes: returnNotes,
      })
      setSelected(data.sale)
      toast(`تم تسجيل المرتجع ${data.return.return_number}`, 'success')
      if (data.sale.customer) {
        toast('تم تحديث حساب العميل (الدين)', 'info')
      }
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setReturnLoading(false)
    }
  }

  const cancelSale = async (id: number) => {
    if (!confirm('إلغاء الفاتورة بالكامل واسترجاع المخزون؟')) return
    try {
      await api.post(`/sales/${id}/cancel/`)
      toast('تم إلغاء الفاتورة', 'success')
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
      const { data } = await api.post<Sale>(`/sales/${selected.id}/record-payment/`, {
        amount,
        method: payMethod,
      })
      setSelected(data)
      toast('تم تسجيل الدفعة وتحديث حساب العميل', 'success')
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setPayLoading(false)
    }
  }

  const amountDue = selected ? parseFloat(selected.amount_due || '0') : 0
  const showReturn = canReturn && selected && selected.status !== 'cancelled'
  const canPay = selected && amountDue > 0 && selected.status !== 'cancelled'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">الفواتير</h1>
      <Card>
        <div className="relative mb-4 max-w-md">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            placeholder="بحث برقم الفاتورة، اسم العميل، الجوال..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>
        {loading ? (
          <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
        ) : sales.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search.trim() ? 'لا توجد نتائج' : 'لا توجد فواتير'}
            description={search.trim() ? 'جرّب كلمات بحث مختلفة' : 'ابدأ من نقطة البيع'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-3 text-right">رقم الفاتورة</th>
                  <th className="py-3 text-right">العميل</th>
                  <th className="py-3 text-right">الإجمالي</th>
                  <th className="py-3 text-right">الصافي</th>
                  <th className="py-3 text-right">الحالة</th>
                  <th className="py-3 text-right">التاريخ</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr
                    key={s.id}
                    className="cursor-pointer border-b border-[var(--border)]/50 hover:bg-[var(--bg-muted)]/60"
                    onClick={() => openDetail(s.id)}
                  >
                    <td className="py-3 font-mono font-medium">{s.invoice_number}</td>
                    <td className="py-3">{s.customer_name || '—'}</td>
                    <td className="py-3">{formatMoney(s.total, saleCurrency(s))}</td>
                    <td className="py-3">{formatMoney(s.net_total ?? s.total, saleCurrency(s))}</td>
                    <td className="py-3">
                      <Badge
                        variant={
                          s.status === 'completed' ? 'success' :
                          s.status === 'partially_returned' ? 'warning' : 'danger'
                        }
                      >
                        {statusLabels[s.status] || s.status}
                      </Badge>
                    </td>
                    <td className="py-3 text-[var(--text-muted)]">{formatDate(s.created_at)}</td>
                    <td className="py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openDetail(s.id)} title="عرض">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadPdfSafe(`/sales/${s.id}/pdf/`, `${s.invoice_number}.pdf`, (m) => toast(m, 'error'))}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
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
        title={selected ? `فاتورة ${selected.invoice_number}` : ''}
        size="xl"
      >
        {loadingDetail ? (
          <p className="py-8 text-center">جاري التحميل...</p>
        ) : selected ? (
          <div className="space-y-6">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div><span className="text-[var(--text-muted)]">العميل: </span>{selected.customer_name || '—'}</div>
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
                    <th className="hidden py-2 text-right sm:table-cell">IMEI</th>
                    <th className="py-2 text-right">الكمية</th>
                    <th className="hidden py-2 text-right sm:table-cell">مُرتجع</th>
                    <th className="py-2 text-right">السعر</th>
                    <th className="py-2 text-right">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items?.map((item: SaleItem) => (
                    <tr key={item.id} className="border-b border-[var(--border)]/40">
                      <td className="break-words py-2">{item.product_name}</td>
                      <td className="hidden py-2 font-mono text-xs sm:table-cell">{item.imei || '—'}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="hidden py-2 sm:table-cell">{item.quantity_returned}</td>
                      <td className="whitespace-nowrap py-2">{formatMoney(item.unit_price, saleCurrency(selected))}</td>
                      <td className="whitespace-nowrap py-2">{formatMoney(item.line_total, saleCurrency(selected))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
            </div>

            <div className="rounded-xl bg-[var(--bg-muted)] p-4 text-sm space-y-1">
              <div className="flex justify-between"><span>المجموع</span><span>{formatMoney(selected.subtotal || 0, saleCurrency(selected))}</span></div>
              <div className="flex justify-between"><span>الخصم</span><span>{formatMoney(selected.discount || 0, saleCurrency(selected))}</span></div>
              <div className="flex justify-between"><span>الضريبة</span><span>{formatMoney(selected.tax_amount || 0, saleCurrency(selected))}</span></div>
              <div className="flex justify-between font-bold"><span>الإجمالي</span><span>{formatMoney(selected.total, saleCurrency(selected))}</span></div>
              {parseFloat(selected.total_returned || '0') > 0 && (
                <>
                  <div className="flex justify-between text-[var(--danger)]"><span>المرتجعات</span><span>-{formatMoney(selected.total_returned!, saleCurrency(selected))}</span></div>
                  <div className="flex justify-between font-bold text-[var(--primary)]"><span>الصافي</span><span>{formatMoney(selected.net_total || 0, saleCurrency(selected))}</span></div>
                </>
              )}
              <div className="flex justify-between"><span>المدفوع</span><span>{formatMoney(selected.amount_paid, saleCurrency(selected))}</span></div>
              {amountDue > 0 && (
                <div className="flex justify-between font-bold text-amber-600">
                  <span>المتبقي على الفاتورة</span>
                  <span>{formatMoney(amountDue, saleCurrency(selected))}</span>
                </div>
              )}
            </div>

            {selected.payments && selected.payments.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">دفعات لاحقة</h4>
                {selected.payments.map((p) => (
                  <div key={p.id} className="mb-2 flex justify-between rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                    <span>{formatDate(p.created_at)} — {paymentLabels[p.method] || p.method}</span>
                    <span className="font-medium text-emerald-600">{formatMoney(p.amount, saleCurrency(selected))}</span>
                  </div>
                ))}
              </div>
            )}

            {canPay && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold">
                  <Wallet className="h-4 w-4" />
                  إكمال الدفع (متبقي {formatMoney(amountDue, saleCurrency(selected))})
                </h4>
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    label="المبلغ"
                    type="number"
                    step="0.01"
                    max={amountDue}
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="min-w-[140px] flex-1"
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">طريقة الدفع</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
                    >
                      <option value="cash">نقدي</option>
                      <option value="electronic">إلكتروني</option>
                    </select>
                  </div>
                  <Button onClick={submitPayment} loading={payLoading}>
                    تسجيل الدفعة
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => setPayAmount(String(amountDue))}>
                    المبلغ كامل
                  </Button>
                </div>
                {selected.customer && (
                  <p className="mt-2 text-xs text-[var(--text-muted)]">
                    يُخصم المبلغ من دين العميل: {selected.customer_name}
                  </p>
                )}
              </div>
            )}

            {selected.returns && selected.returns.length > 0 && (
              <div>
                <h4 className="mb-2 font-semibold">سجل المرتجعات</h4>
                {selected.returns.map((r) => (
                  <div key={r.id} className="mb-2 rounded-lg border border-[var(--border)] p-3 text-sm">
                    <p className="font-medium">{r.return_number} — {formatMoney(r.refund_amount, saleCurrency(selected))}</p>
                    <p className="text-[var(--text-muted)]">{formatDate(r.created_at)}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => downloadPdfSafe(`/sales/${selected.id}/pdf/`, `${selected.invoice_number}.pdf`, (m) => toast(m, 'error'))}
              >
                <Download className="h-4 w-4" />
                تحميل PDF
              </Button>
              {canCancel && selected.status === 'completed' && (
                <Button variant="danger" onClick={() => cancelSale(selected.id)}>
                  <XCircle className="h-4 w-4" />
                  إلغاء كامل
                </Button>
              )}
            </div>

            {showReturn && (
              <div className="border-t border-[var(--border)] pt-4">
                <h4 className="mb-3 flex items-center gap-2 font-semibold">
                  <RotateCcw className="h-4 w-4" />
                  مرتجع جزئي
                </h4>
                <div className="space-y-3">
                  {selected.items?.filter((i) => i.quantity_available_to_return > 0).map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm">{item.product_name}</span>
                      <span className="text-xs text-[var(--text-muted)]">متاح: {item.quantity_available_to_return}</span>
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity_available_to_return}
                        value={returnQty[item.id] || ''}
                        onChange={(e) => setReturnQty({ ...returnQty, [item.id]: e.target.value })}
                        className="w-24"
                        placeholder="كمية"
                      />
                    </div>
                  ))}
                  <Input
                    label="ملاحظات"
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                  />
                  <Button onClick={submitPartialReturn} loading={returnLoading}>
                    تسجيل المرتجع
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
