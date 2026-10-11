import { useEffect, useState } from 'react'
import { Wrench, Plus, ScanBarcode } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { extractList } from '../../lib/apiHelpers'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { BarcodeScannerModal } from '../../components/barcode/BarcodeScannerModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToastStore } from '../../stores/toastStore'
import { normalizeImei } from '../../lib/productLookup'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { formatMoney, formatDate } from '../../lib/utils'
import { getCachedCustomers } from '../../offline/cache'
import { enqueueOperation, newClientRequestId } from '../../offline/outbox'
import { useOnlineStatus } from '../../offline/useOfflineSync'
import type { Customer, RepairOrder } from '../../types'

const statusColors: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'danger'> = {
  received: 'primary',
  diagnosing: 'warning',
  waiting_parts: 'warning',
  in_progress: 'primary',
  ready: 'success',
  delivered: 'success',
  cancelled: 'danger',
}

const emptyForm = {
  customer: '',
  customer_name: '',
  customer_phone: '',
  device_brand: '',
  device_model: '',
  imei: '',
  issue_description: '',
  diagnosis: '',
  status: 'received',
  labor_cost: '0',
  parts_cost: '0',
  deposit_paid: '0',
  estimated_delivery: '',
  notes: '',
}

export function RepairsPage() {
  const currency = useAuthStore((s) => s.currentStore()?.currency)
  const store = useCurrentStore()
  const online = useOnlineStatus()
  const toast = useToastStore((s) => s.add)
  const [orders, setOrders] = useState<RepairOrder[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [imeiScanOpen, setImeiScanOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [deliveryPay, setDeliveryPay] = useState('')
  const [deliveryPayMethod, setDeliveryPayMethod] = useState('cash')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payLoading, setPayLoading] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<RepairOrder | null>(null)

  const load = () => {
    if (!navigator.onLine) {
      toast('عرض التذاكر المحفوظة على الخادم يتطلب اتصالاً — يمكنك فتح تذكرة جديدة دون اتصال', 'info')
      return
    }
    const params: Record<string, string> = {}
    if (statusFilter) params.status = statusFilter
    api
      .get<RepairOrder[] | { results: RepairOrder[] }>('/repairs/', { params })
      .then(({ data }) => setOrders(extractList(data)))
      .catch((e) => toast(getErrorMessage(e), 'error'))
  }

  useEffect(() => {
    load()
    const loadCustomers = async () => {
      if (!navigator.onLine && store?.id) {
        const cached = await getCachedCustomers(store.id)
        setCustomers(
          cached.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: '',
            debt: c.debt,
            is_active: c.is_active,
          })),
        )
        return
      }
      try {
        const { data } = await api.get<Customer[] | { results: Customer[] }>('/customers/')
        setCustomers(extractList(data))
      } catch {
        /* ignore */
      }
    }
    void loadCustomers()
  }, [statusFilter, store?.id])

  const openCreate = () => {
    setEditId(null)
    setSelectedOrder(null)
    setForm(emptyForm)
    setDeliveryPay('')
    setPayAmount('')
    setOpen(true)
  }

  const openEdit = (order: RepairOrder) => {
    setEditId(order.id)
    setSelectedOrder(order)
    setForm({
      customer: order.customer ? String(order.customer) : '',
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      device_brand: order.device_brand,
      device_model: order.device_model,
      imei: order.imei,
      issue_description: order.issue_description,
      diagnosis: order.diagnosis,
      status: order.status,
      labor_cost: order.labor_cost,
      parts_cost: order.parts_cost,
      deposit_paid: order.deposit_paid,
      estimated_delivery: order.estimated_delivery || '',
      notes: order.notes,
    })
    const due = parseFloat(order.amount_due || '0') || Math.max(0, parseFloat(order.total_cost) - parseFloat(order.deposit_paid))
    setDeliveryPay(due > 0 ? String(due) : '')
    setPayAmount(due > 0 ? String(due) : '')
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!navigator.onLine && form.status === 'delivered') {
      toast('تسليم التذكرة يتطلب اتصالاً (يؤثر على دين العميل)', 'error')
      return
    }
    setLoading(true)
    const payload: Record<string, unknown> = {
      ...form,
      customer: form.customer ? parseInt(form.customer, 10) : null,
      labor_cost: form.labor_cost || '0',
      parts_cost: form.parts_cost || '0',
      deposit_paid: form.deposit_paid || '0',
      estimated_delivery: form.estimated_delivery || null,
    }
    if (editId && form.status === 'delivered' && deliveryPay && parseFloat(deliveryPay) > 0) {
      payload.delivery_payment_amount = deliveryPay
      payload.delivery_payment_method = deliveryPayMethod
    }
    const clientRequestId = newClientRequestId()
    try {
      if (!navigator.onLine) {
        if (!store?.id) {
          toast('لا يمكن حفظ الصيانة دون متجر', 'error')
          return
        }
        if (editId) {
          await enqueueOperation({
            storeId: store.id,
            operation: 'repair.patch',
            method: 'PATCH',
            path: `/repairs/${editId}/`,
            payload,
            localLabel: `صيانة #${editId}`,
            clientRequestId,
          })
          setOrders((prev) =>
            prev.map((o) =>
              o.id === editId
                ? {
                    ...o,
                    ...payload,
                    customer: payload.customer as number | null,
                    labor_cost: String(payload.labor_cost),
                    parts_cost: String(payload.parts_cost),
                    deposit_paid: String(payload.deposit_paid),
                    total_cost: String(
                      (parseFloat(String(payload.labor_cost)) || 0) +
                        (parseFloat(String(payload.parts_cost)) || 0),
                    ),
                    status_display: form.status,
                  }
                : o,
            ),
          )
          toast('حُفظ التعديل محلياً — سيُزامَن عند الاتصال', 'success')
        } else {
          const entry = await enqueueOperation({
            storeId: store.id,
            operation: 'repair.create',
            method: 'POST',
            path: '/repairs/',
            payload,
            localLabel: `صيانة OFF-${clientRequestId.slice(0, 8).toUpperCase()}`,
            clientRequestId,
          })
          const local: RepairOrder = {
            id: -Date.now(),
            ticket_number: entry.localLabel,
            customer: payload.customer as number | null,
            customer_name: form.customer_name,
            customer_phone: form.customer_phone,
            customer_display: form.customer_name || '—',
            device_brand: form.device_brand,
            device_model: form.device_model,
            imei: form.imei,
            issue_description: form.issue_description,
            diagnosis: form.diagnosis,
            status: form.status,
            status_display: 'مستلم (محلي)',
            labor_cost: String(payload.labor_cost),
            parts_cost: String(payload.parts_cost),
            total_cost: String(
              (parseFloat(String(payload.labor_cost)) || 0) +
                (parseFloat(String(payload.parts_cost)) || 0),
            ),
            deposit_paid: String(payload.deposit_paid),
            assigned_to: null,
            assigned_to_name: '—',
            estimated_delivery: form.estimated_delivery || null,
            notes: form.notes,
            received_at: new Date().toISOString(),
            completed_at: null,
            created_at: new Date().toISOString(),
          }
          setOrders((prev) => [local, ...prev])
          toast(`حُفظت التذكرة محلياً ${entry.localLabel}`, 'success')
        }
        setOpen(false)
        return
      }

      if (editId) await api.patch(`/repairs/${editId}/`, payload)
      else await api.post('/repairs/', { ...payload, client_request_id: clientRequestId })
      toast(editId ? 'تم التحديث' : 'تم فتح تذكرة صيانة', 'success')
      setOpen(false)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const submitRepairPayment = async () => {
    if (!editId) return
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'error')
      return
    }
    setPayLoading(true)
    try {
      const { data } = await api.post<RepairOrder>(`/repairs/${editId}/record-payment/`, {
        amount,
        method: payMethod,
      })
      setSelectedOrder(data)
      setForm((f) => ({ ...f, deposit_paid: data.deposit_paid }))
      setPayAmount(data.amount_due || '0')
      toast('تم تسجيل الدفعة', 'success')
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setPayLoading(false)
    }
  }

  const formTotal =
    (parseFloat(form.labor_cost) || 0) + (parseFloat(form.parts_cost) || 0)
  const formDue = Math.max(0, formTotal - (parseFloat(form.deposit_paid) || 0))
  const ticketCurrency = selectedOrder?.currency || currency

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">الصيانة والإصلاح</h1>
          {!online && (
            <span className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs">
              غير متصل
            </span>
          )}
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          تذكرة جديدة
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm text-[var(--text)]"
        >
          <option value="">كل الحالات</option>
          <option value="received">مستلم</option>
          <option value="diagnosing">تشخيص</option>
          <option value="waiting_parts">بانتظار قطع</option>
          <option value="in_progress">قيد الإصلاح</option>
          <option value="ready">جاهز للتسليم</option>
          <option value="delivered">تم التسليم</option>
          <option value="cancelled">ملغي</option>
        </select>
      </div>

      {orders.length === 0 ? (
        <EmptyState icon={Wrench} title="لا توجد تذاكر صيانة" action={<Button onClick={openCreate}>فتح تذكرة</Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <Card key={o.id} className="cursor-pointer hover:border-[var(--primary)]/40" onClick={() => openEdit(o)}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-mono">{o.ticket_number}</CardTitle>
                  <Badge variant={statusColors[o.status] || 'default'}>{o.status_display}</Badge>
                </div>
              </CardHeader>
              <p className="text-sm font-medium">{o.device_brand} {o.device_model}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{o.customer_display} — {o.customer_phone}</p>
              <p className="mt-2 line-clamp-2 text-sm">{o.issue_description}</p>
              <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-semibold text-[var(--primary)]">{formatMoney(o.total_cost, o.currency || currency)}</span>
                {parseFloat(o.amount_due || String(Math.max(0, parseFloat(o.total_cost) - parseFloat(o.deposit_paid)))) > 0 && (
                  <span className="font-medium text-[var(--danger)]">
                    متبقي: {formatMoney(o.amount_due || String(Math.max(0, parseFloat(o.total_cost) - parseFloat(o.deposit_paid))), o.currency || currency)}
                  </span>
                )}
                <span className="text-[var(--text-muted)]">{formatDate(o.received_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? 'تعديل تذكرة' : 'تذكرة صيانة جديدة'} size="lg">
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">عميل مسجّل</label>
            <select
              value={form.customer}
              onChange={(e) => {
                const c = customers.find((x) => x.id === parseInt(e.target.value, 10))
                setForm({
                  ...form,
                  customer: e.target.value,
                  customer_name: c?.name || form.customer_name,
                  customer_phone: c?.phone || form.customer_phone,
                })
              }}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
            >
              <option value="">بدون / عميل جديد</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
              ))}
            </select>
          </div>
          <Input label="اسم العميل" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
          <Input label="جوال العميل" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} />
          <Input label="ماركة الجهاز" value={form.device_brand} onChange={(e) => setForm({ ...form, device_brand: e.target.value })} />
          <Input label="موديل الجهاز" value={form.device_model} onChange={(e) => setForm({ ...form, device_model: e.target.value })} />
          <div className="space-y-1.5 sm:col-span-2">
            <label className="block text-sm font-medium text-[var(--text)]">IMEI</label>
            <div className="flex gap-2">
              <Input
                value={form.imei}
                onChange={(e) => setForm({ ...form, imei: e.target.value })}
                className="flex-1"
                lang="en"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 px-3"
                onClick={() => setImeiScanOpen(true)}
                aria-label="مسح IMEI بالكاميرا"
                title="مسح IMEI بالكاميرا"
              >
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-medium">وصف العطل</label>
            <textarea
              value={form.issue_description}
              onChange={(e) => setForm({ ...form, issue_description: e.target.value })}
              required
              rows={3}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
            />
          </div>
          {editId && (
            <>
              <div className="sm:col-span-2">
                <label className="text-sm font-medium">التشخيص</label>
                <textarea
                  value={form.diagnosis}
                  onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] px-4 py-2.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium">الحالة</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
                >
                  <option value="received">مستلم</option>
                  <option value="diagnosing">تشخيص</option>
                  <option value="waiting_parts">بانتظار قطع</option>
                  <option value="in_progress">قيد الإصلاح</option>
                  <option value="ready">جاهز للتسليم</option>
                  <option value="delivered">تم التسليم</option>
                  <option value="cancelled">ملغي</option>
                </select>
              </div>
              <Input label="تاريخ التسليم المتوقع" type="date" value={form.estimated_delivery} onChange={(e) => setForm({ ...form, estimated_delivery: e.target.value })} />
            </>
          )}
          <Input label="أجرة اليد" type="number" step="0.01" value={form.labor_cost} onChange={(e) => setForm({ ...form, labor_cost: e.target.value })} />
          <Input label="تكلفة القطع" type="number" step="0.01" value={form.parts_cost} onChange={(e) => setForm({ ...form, parts_cost: e.target.value })} />
          <Input label="العربون / المدفوع" type="number" step="0.01" value={form.deposit_paid} onChange={(e) => setForm({ ...form, deposit_paid: e.target.value })} />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] px-4 py-3 text-sm">
            <div className="flex justify-between"><span>الإجمالي</span><span className="font-semibold">{formatMoney(formTotal, ticketCurrency)}</span></div>
            <div className="mt-1 flex justify-between text-[var(--danger)]"><span>المتبقي</span><span className="font-semibold">{formatMoney(formDue, ticketCurrency)}</span></div>
          </div>
          {editId && form.status === 'delivered' && formDue > 0 && (
            <>
              <Input
                label="تحصيل عند التسليم"
                type="number"
                step="0.01"
                value={deliveryPay}
                onChange={(e) => setDeliveryPay(e.target.value)}
              />
              <div>
                <label className="text-sm font-medium">طريقة التحصيل</label>
                <select
                  value={deliveryPayMethod}
                  onChange={(e) => setDeliveryPayMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
                >
                  <option value="cash">نقدي</option>
                  <option value="electronic">إلكتروني</option>
                </select>
              </div>
            </>
          )}
          <Input label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="sm:col-span-2" />
          {editId && formDue > 0 && form.status !== 'cancelled' && online && (
            <div className="sm:col-span-2 space-y-3 rounded-xl border border-[var(--border)] p-4">
              <p className="text-sm font-medium">تسجيل دفعة على التذكرة</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="المبلغ" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <div>
                  <label className="text-sm font-medium">الطريقة</label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
                  >
                    <option value="cash">نقدي</option>
                    <option value="electronic">إلكتروني</option>
                  </select>
                </div>
                <Button type="button" onClick={submitRepairPayment} loading={payLoading} className="self-end">
                  تسجيل الدفعة
                </Button>
              </div>
            </div>
          )}
          <Button type="submit" loading={loading} className="sm:col-span-2">
            {editId ? 'حفظ التعديلات' : 'فتح التذكرة'}
          </Button>
        </form>
      </Modal>
      <BarcodeScannerModal
        open={imeiScanOpen}
        onClose={() => setImeiScanOpen(false)}
        onScan={(code) => {
          setForm((f) => ({ ...f, imei: normalizeImei(code) }))
          toast('تم قراءة IMEI', 'success')
        }}
        title="مسح IMEI بالكاميرا"
        hint="وجّه الكاميرا نحو ملصق IMEI على الجهاز (أو QR الخاص بالجهاز)."
      />
    </div>
  )
}
