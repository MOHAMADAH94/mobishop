import { useEffect, useState } from 'react'
import { Truck, Plus, Search, Pencil, Trash2 } from 'lucide-react'
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
import type { Supplier } from '../../types'

const emptyForm = { name: '', phone: '', email: '', address: '', notes: '' }

export function SuppliersPage() {
  const store = useCurrentStore()
  const currency = store?.currency
  const storeVersion = useStoreVersion()
  const canManage = hasPermission(store?.role, 'suppliers')
  const toast = useToastStore((s) => s.add)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [listLoading, setListLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setListLoading(true)
    try {
      const params: Record<string, string> = {}
      if (search.trim()) params.search = search.trim()
      const { data } = await api.get<Supplier[] | { results: Supplier[] }>('/purchases/suppliers/', { params })
      setSuppliers(extractList(data))
    } catch (err) {
      toast(getErrorMessage(err), 'error')
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

  const openEdit = (supplier: Supplier) => {
    setEditing(supplier)
    setForm({
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    })
    setOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (editing) {
        await api.patch(`/purchases/suppliers/${editing.id}/`, form)
        toast('تم تحديث المورد', 'success')
      } else {
        await api.post('/purchases/suppliers/', form)
        toast('تم إضافة المورد', 'success')
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
      await api.delete(`/purchases/suppliers/${deleting.id}/`)
      toast('تم حذف المورد', 'success')
      setDeleting(null)
      load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الموردون</h1>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            مورد جديد
          </Button>
        )}
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
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={search.trim() ? 'لا توجد نتائج' : 'لا يوجد موردون'}
          description={search.trim() ? 'جرّب كلمات بحث مختلفة' : undefined}
          action={!search.trim() && canManage ? <Button onClick={openCreate}>إضافة</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <Card key={s.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{s.name}</h3>
                {canManage && (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)} aria-label="تعديل">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(s)} aria-label="حذف">
                      <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                    </Button>
                  </div>
                )}
              </div>
              {s.phone && <p className="mt-1 text-sm text-[var(--text-muted)]">{s.phone}</p>}
              {s.email && <p className="text-sm text-[var(--text-muted)]">{s.email}</p>}
              <div className="mt-4 flex justify-between text-sm">
                <span>المستحق للمورد</span>
                <span className={parseFloat(s.balance) > 0 ? 'text-[var(--danger)] font-medium' : ''}>
                  {formatMoney(s.balance, currency)}
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{s.purchases_count ?? 0} فاتورة شراء</p>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm) }}
        title={editing ? 'تعديل المورد' : 'مورد جديد'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="الجوال" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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
        title="حذف المورد"
        message={
          deleting && parseFloat(deleting.balance) > 0
            ? `«${deleting.name}» لديه مستحقات ${formatMoney(deleting.balance, currency)}. الحذف يخفيه من القائمة لكن الفواتير السابقة تبقى في النظام.`
            : `هل تريد حذف «${deleting?.name}»؟`
        }
        loading={loading}
        confirmLabel="حذف"
      />
    </div>
  )
}
