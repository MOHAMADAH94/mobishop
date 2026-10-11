import { useEffect, useState } from 'react'
import { Users, Plus, Search, Pencil, Trash2 } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { hasPermission } from '../../lib/permissions'
import { formatMoney } from '../../lib/utils'
import { extractList } from '../../lib/apiHelpers'
import { CustomerDebtRefs } from '../../components/customers/CustomerDebtRefs'
import { getCachedCustomers, putCachedCustomer } from '../../offline/cache'
import { enqueueOperation, newClientRequestId } from '../../offline/outbox'
import type { Customer } from '../../types'

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' }

export function CustomersPage() {
  const store = useCurrentStore()
  const currency = store?.currency
  const storeVersion = useStoreVersion()
  const canManage = hasPermission(store?.role, 'customers')
  const toast = useToastStore((s) => s.add)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState<Customer | null>(null)
  const [payRef, setPayRef] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('cash')
  const [payLoading, setPayLoading] = useState(false)

  const load = async () => {
    setListLoading(true)
    try {
      if (!navigator.onLine && store?.id) {
        const cached = await getCachedCustomers(store.id)
        let list = cached.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: '',
          debt: c.debt,
          is_active: c.is_active,
        }))
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          list = list.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
        }
        setCustomers(list)
        return
      }
      const params: Record<string, string> = {}
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get<Customer[] | { results: Customer[] }>('/customers/', { params })
      setCustomers(extractList(data))
    } catch (err) {
      if (store?.id) {
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
      } else {
        toast(getErrorMessage(err), 'error')
      }
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search, storeVersion])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (customer: Customer) => {
    setEditing(customer)
    setForm({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || '',
    })
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) {
        if (!navigator.onLine) {
          toast('تعديل العميل يتطلب اتصالاً', 'error')
          return
        }
        await api.patch(`/customers/${editing.id}/`, form)
        toast('تم تحديث العميل', 'success')
      } else {
        const clientRequestId = newClientRequestId()
        if (!navigator.onLine) {
          if (!store?.id) {
            toast('لا يمكن إضافة عميل دون متجر', 'error')
            return
          }
          const tempId = -Date.now()
          await enqueueOperation({
            storeId: store.id,
            operation: 'customer.create',
            method: 'POST',
            path: '/customers/',
            payload: { ...form },
            localLabel: `عميل: ${form.name}`,
            clientRequestId,
            localTempId: tempId,
          })
          await putCachedCustomer(store.id, {
            id: tempId,
            storeId: store.id,
            name: form.name,
            phone: form.phone,
            debt: '0',
            is_active: true,
          })
          toast('حُفظ العميل محلياً — سيُزامَن عند الاتصال', 'success')
        } else {
          await api.post('/customers/', { ...form, client_request_id: clientRequestId })
          toast('تم إضافة العميل', 'success')
        }
      }
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setLoading(true)
    try {
      await api.delete(`/customers/${deleting.id}/`)
      toast('تم حذف العميل', 'success')
      setDeleting(null)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  const openPay = (customer: Customer) => {
    setPaying(customer)
    const refs = customer.debt_references || []
    setPayRef(refs[0] ? `${refs[0].type}:${refs[0].id}` : '')
    setPayAmount(refs[0]?.amount_due_original || refs[0]?.amount_due || customer.debt || '')
    setPayMethod('cash')
  }

  const submitCustomerPayment = async () => {
    if (!paying || !payRef) {
      toast('اختر مرجعاً للدفع', 'error')
      return
    }
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) {
      toast('أدخل مبلغاً صحيحاً', 'error')
      return
    }
    const [type, idStr] = payRef.split(':')
    const body: Record<string, unknown> = { amount, method: payMethod }
    if (type === 'sale') body.sale_id = parseInt(idStr, 10)
    else body.repair_id = parseInt(idStr, 10)
    setPayLoading(true)
    try {
      await api.post(`/customers/${paying.id}/record-payment/`, body)
      toast('تم تسجيل الدفعة وتحديث الدين', 'success')
      setPaying(null)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setPayLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">العملاء</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          عميل جديد
        </Button>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          placeholder="بحث بالاسم، الجوال، البريد..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-10"
        />
      </div>
      {listLoading ? (
        <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search.trim() ? 'لا توجد نتائج' : 'لا يوجد عملاء'}
          description={search.trim() ? 'جرّب كلمات بحث مختلفة' : undefined}
          action={!search.trim() ? <Button onClick={openCreate}>إضافة</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {customers.map((c) => (
            <Card key={c.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label="تعديل">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label="حذف">
                      <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{c.phone}</p>
              {c.email && <p className="text-sm text-[var(--text-muted)]">{c.email}</p>}
              <div className="mt-4 flex justify-between text-sm">
                <span>الدين</span>
                <span className={parseFloat(c.debt) > 0 ? 'text-[var(--danger)] font-medium' : ''}>
                  {formatMoney(c.debt, currency)}
                </span>
              </div>
              <CustomerDebtRefs refs={c.debt_references || []} currency={currency} />
              {canManage && parseFloat(c.debt) > 0 && (c.debt_references?.length ?? 0) > 0 && (
                <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => openPay(c)}>
                  تسجيل دفعة
                </Button>
              )}
              <p className="mt-2 text-xs text-[var(--text-muted)]">{c.sales_count ?? 0} فاتورة</p>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm) }}
        title={editing ? 'تعديل العميل' : 'عميل جديد'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="الجوال" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          <Input label="البريد" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <Input label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button type="submit" loading={loading} className="w-full">حفظ</Button>
        </form>
      </Modal>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف العميل"
        message={
          deleting && parseFloat(deleting.debt) > 0
            ? `«${deleting.name}» لديه دين ${formatMoney(deleting.debt, currency)}. الحذف يخفيه من القائمة لكن الفواتير والديون السابقة تبقى في النظام.`
            : `هل تريد حذف «${deleting?.name}»؟`
        }
        loading={loading}
        confirmLabel="حذف"
      />
      <Modal
        open={Boolean(paying)}
        onClose={() => setPaying(null)}
        title={paying ? `دفعة — ${paying.name}` : 'دفعة'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">المرجع</label>
            <select
              value={payRef}
              onChange={(e) => {
                setPayRef(e.target.value)
                const ref = paying?.debt_references?.find((r) => `${r.type}:${r.id}` === e.target.value)
                if (ref) setPayAmount(ref.amount_due_original || ref.amount_due)
              }}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
            >
              {(paying?.debt_references || []).map((r) => (
                <option key={`${r.type}-${r.id}`} value={`${r.type}:${r.id}`}>
                  {r.type === 'sale' ? 'فاتورة' : 'صيانة'} {r.reference} —{' '}
                  {formatMoney(r.amount_due_original || r.amount_due, r.currency || currency)}
                </option>
              ))}
            </select>
          </div>
          <Input label="المبلغ" type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          <div>
            <label className="text-sm font-medium">طريقة الدفع</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-[var(--text)]"
            >
              <option value="cash">نقدي</option>
              <option value="electronic">إلكتروني</option>
            </select>
          </div>
          <Button onClick={submitCustomerPayment} loading={payLoading} className="w-full">
            تأكيد الدفعة
          </Button>
        </div>
      </Modal>
    </div>
  )
}
