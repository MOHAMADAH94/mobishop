import { useCallback, useEffect, useState } from 'react'
import { Wallet, Plus, Pencil, Trash2, Filter } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { hasPermission } from '../../lib/permissions'
import { formatMoney } from '../../lib/utils'
import { Pagination } from '../../components/ui/Pagination'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { enqueueOperation, newClientRequestId } from '../../offline/outbox'
import type { Expense, Paginated } from '../../types'

const categoryOptions = [
  { value: 'rent', label: 'إيجار' },
  { value: 'salary', label: 'رواتب' },
  { value: 'utilities', label: 'خدمات' },
  { value: 'supplies', label: 'مستلزمات' },
  { value: 'marketing', label: 'تسويق' },
  { value: 'maintenance', label: 'صيانة محل' },
  { value: 'other', label: 'أخرى' },
]

const paymentOptions = [
  { value: 'cash', label: 'نقدي' },
  { value: 'electronic', label: 'إلكتروني' },
  { value: 'other', label: 'أخرى' },
]

function todayInputValue() {
  return new Date().toISOString().slice(0, 10)
}

const emptyForm = {
  title: '',
  amount: '',
  category: 'other',
  payment_method: 'cash',
  expense_date: todayInputValue(),
  notes: '',
}

export function ExpensesPage() {
  const store = useCurrentStore()
  const currency = useAuthStore((s) => s.currentStore()?.currency)
  const canManage = hasPermission(useAuthStore((s) => s.currentStore()?.role), 'expenses')
  const toast = useToastStore((s) => s.add)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState<Expense | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [category, setCategory] = useState('')
  const [applied, setApplied] = useState({ dateFrom: '', dateTo: '', category: '' })

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = { page: String(page) }
    if (applied.dateFrom) params.date_from = applied.dateFrom
    if (applied.dateTo) params.date_to = applied.dateTo
    if (applied.category) params.category = applied.category
    api
      .get<Paginated<Expense>>('/expenses/', { params })
      .then(({ data }) => {
        setExpenses(data.results)
        setTotalCount(data.count)
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setLoading(false))
  }, [applied, page, toast])

  const applyFilters = () => {
    setPage(1)
    setApplied({ dateFrom, dateTo, category })
  }

  useEffect(() => {
    load()
  }, [load])

  const totalFiltered = expenses.reduce((sum, e) => sum + parseFloat(e.amount || '0'), 0)

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, expense_date: todayInputValue() })
    setOpen(true)
  }

  const openEdit = (expense: Expense) => {
    setEditing(expense)
    setForm({
      title: expense.title,
      amount: expense.amount,
      category: expense.category,
      payment_method: expense.payment_method,
      expense_date: expense.expense_date,
      notes: expense.notes || '',
    })
    setOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount),
      }
      if (editing) {
        if (!navigator.onLine) {
          toast('تعديل المصروف يتطلب اتصالاً', 'error')
          return
        }
        await api.patch(`/expenses/${editing.id}/`, payload)
        toast('تم تحديث المصروف', 'success')
      } else {
        const clientRequestId = newClientRequestId()
        if (!navigator.onLine) {
          if (!store?.id) {
            toast('لا يمكن تسجيل مصروف دون متجر', 'error')
            return
          }
          await enqueueOperation({
            storeId: store.id,
            operation: 'expense.create',
            method: 'POST',
            path: '/expenses/',
            payload,
            localLabel: `مصروف: ${form.title}`,
            clientRequestId,
          })
          toast('حُفظ المصروف محلياً — سيُزامَن عند الاتصال', 'success')
        } else {
          await api.post('/expenses/', { ...payload, client_request_id: clientRequestId })
          toast('تم تسجيل المصروف', 'success')
        }
      }
      setOpen(false)
      setEditing(null)
      setForm(emptyForm)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    setSaving(true)
    try {
      await api.delete(`/expenses/${deleting.id}/`)
      toast('تم حذف المصروف', 'success')
      setDeleting(null)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">المصاريف</h1>
          <p className="text-sm text-[var(--text-muted)]">
            تُخصم من الأرباح في لوحة التحكم حسب تاريخ المصروف
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            مصروف جديد
          </Button>
        )}
      </div>

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
            <label className="mb-1.5 block text-sm font-medium">التصنيف</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm"
            >
              <option value="">الكل</option>
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <Button onClick={applyFilters}>
            <Filter className="h-4 w-4" />
            تطبيق
          </Button>
        </div>

        <div className="mb-4 rounded-xl bg-[var(--bg-muted)] px-4 py-3 text-sm">
          <span className="text-[var(--text-muted)]">إجمالي هذه الصفحة: </span>
          <span className="font-bold text-[var(--danger)]">{formatMoney(totalFiltered, currency)}</span>
          <span className="mx-2 text-[var(--text-muted)]">·</span>
          <span className="text-[var(--text-muted)]">{totalCount} بند إجمالاً</span>
        </div>

        {loading ? (
          <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="لا توجد مصاريف"
            action={canManage ? <Button onClick={openCreate}>إضافة مصروف</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="py-3 text-right font-medium">التاريخ</th>
                  <th className="py-3 text-right font-medium">الوصف</th>
                  <th className="py-3 text-right font-medium">التصنيف</th>
                  <th className="py-3 text-right font-medium">الدفع</th>
                  <th className="py-3 text-right font-medium">المبلغ</th>
                  <th className="py-3" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-muted)]/50">
                    <td className="py-3 text-[var(--text-muted)]">{e.expense_date}</td>
                    <td className="py-3">
                      <p className="font-medium">{e.title}</p>
                      {e.notes && <p className="text-xs text-[var(--text-muted)]">{e.notes}</p>}
                    </td>
                    <td className="py-3">
                      <Badge variant="primary">{e.category_label}</Badge>
                    </td>
                    <td className="py-3 text-[var(--text-muted)]">{e.payment_method_label}</td>
                    <td className="py-3 font-medium text-[var(--danger)]">{formatMoney(e.amount, currency)}</td>
                    <td className="py-3 text-left">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(e)} aria-label="تعديل">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleting(e)} aria-label="حذف">
                            <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                          </Button>
                        </div>
                      )}
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
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm) }}
        title={editing ? 'تعديل مصروف' : 'مصروف جديد'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input label="الوصف" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Input
            label="المبلغ"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
            required
          />
          <Input
            label="تاريخ المصروف"
            type="date"
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium">التصنيف</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
            >
              {categoryOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">طريقة الدفع</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
            >
              {paymentOptions.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <Input label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button type="submit" loading={saving} className="w-full">حفظ</Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف المصروف"
        message={`حذف «${deleting?.title}»؟ سيُعاد احتساب الأرباح في لوحة التحكم.`}
        loading={saving}
        confirmLabel="حذف"
      />
    </div>
  )
}
