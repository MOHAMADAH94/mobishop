import { useEffect, useState } from 'react'
import { Tags, Plus, Pencil, Trash2, Store } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { EmptyState } from '../../components/ui/EmptyState'
import { Badge } from '../../components/ui/Badge'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { useAuthStore } from '../../stores/authStore'
import { extractList } from '../../lib/apiHelpers'
import { hasPermission } from '../../lib/permissions'
import type { Category } from '../../types'

const emptyForm = () => ({
  name: '',
  description: '',
  slug: '',
  show_in_catalog: true,
  featured: false,
  sort_order: '0',
})

export function CategoriesPage() {
  const toast = useToastStore((s) => s.add)
  const store = useCurrentStore()
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const catalogEnabled = Boolean(store?.catalog_enabled)
  const canManage = hasPermission(store?.role, 'categories')
  const storeVersion = useStoreVersion()
  const [categories, setCategories] = useState<Category[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const load = () => {
    api
      .get<Category[] | { results: Category[] }>('/products/categories/')
      .then(({ data }) => setCategories(extractList(data)))
      .catch((err) => toast(getErrorMessage(err), 'error'))
  }

  useEffect(() => {
    refreshStores().catch(() => {})
  }, [refreshStores])

  useEffect(() => {
    load()
  }, [storeVersion])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setImageFile(null)
    setOpen(true)
  }

  const openEdit = (category: Category) => {
    setEditing(category)
    setForm({
      name: category.name,
      description: category.description || '',
      slug: category.slug || '',
      show_in_catalog: category.show_in_catalog ?? true,
      featured: category.featured ?? false,
      sort_order: String(category.sort_order ?? 0),
    })
    setImageFile(null)
    setOpen(true)
  }

  const buildPayload = () => {
    const base = {
      name: form.name,
      description: form.description,
      show_in_catalog: form.show_in_catalog,
      featured: form.featured,
      sort_order: parseInt(form.sort_order, 10) || 0,
    }
    if (!catalogEnabled) return base

    const withCatalog = {
      ...base,
      slug: form.slug || undefined,
    }

    if (imageFile) {
      const fd = new FormData()
      Object.entries(withCatalog).forEach(([k, v]) => fd.append(k, String(v)))
      fd.append('image', imageFile)
      return fd
    }
    return withCatalog
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const payload = buildPayload()
    const isMultipart = payload instanceof FormData
    const config = isMultipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined

    try {
      if (editing) {
        await api.patch(`/products/categories/${editing.id}/`, payload, config)
        toast('تم تحديث التصنيف', 'success')
      } else {
        await api.post('/products/categories/', payload, config)
        toast('تم إنشاء التصنيف', 'success')
      }
      setOpen(false)
      setEditing(null)
      setForm(emptyForm())
      setImageFile(null)
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
      await api.delete(`/products/categories/${deleting.id}/`)
      toast('تم حذف التصنيف', 'success')
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
        <h1 className="text-2xl font-bold">التصنيفات</h1>
        {canManage && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            تصنيف جديد
          </Button>
        )}
      </div>

      {catalogEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3 text-sm">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          <p className="text-[var(--text-muted)]">
            التصنيفات الظاهرة في المعرض تحتاج منتجات منشورة. يمكنك إخفاء تصنيف من المعرض أو تمييزه كـ «مميز».
          </p>
        </div>
      )}

      {categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="لا توجد تصنيفات"
          action={canManage ? <Button onClick={openCreate}>إضافة</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {c.image_url && (
                      <img src={c.image_url} alt="" className="mb-2 h-16 w-16 rounded-lg object-cover" />
                    )}
                    <CardTitle>{c.name}</CardTitle>
                  </div>
                  {canManage && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label="تعديل">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label="حذف">
                        <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <div className="flex flex-wrap gap-2 text-sm text-[var(--text-muted)]">
                <span>{c.products_count} منتج</span>
                {catalogEnabled && c.catalog_products_count != null && (
                  <span>· {c.catalog_products_count} في المعرض</span>
                )}
              </div>
              {catalogEnabled && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {c.show_in_catalog === false && <Badge>مخفي من المعرض</Badge>}
                  {c.featured && <Badge variant="primary">مميز</Badge>}
                  {c.slug && <Badge variant="default">{c.slug}</Badge>}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => { setOpen(false); setEditing(null); setForm(emptyForm()); setImageFile(null) }}
        title={editing ? 'تعديل التصنيف' : 'تصنيف جديد'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="اسم التصنيف"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="الوصف"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          {catalogEnabled && (
            <>
              <Input
                label="معرّف التصنيف (Slug)"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="mobile-phones"
              />
              <Input
                label="ترتيب العرض"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium">صورة التصنيف</label>
                {editing?.image_url && !imageFile && (
                  <img src={editing.image_url} alt="" className="mb-2 h-20 rounded-lg object-cover" />
                )}
                <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
              </div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.show_in_catalog}
                  onChange={(e) => setForm({ ...form, show_in_catalog: e.target.checked })}
                />
                <span className="text-sm">عرض في المعرض</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                <span className="text-sm">تصنيف مميز (يظهر أولاً)</span>
              </label>
            </>
          )}
          <Button type="submit" loading={loading} className="w-full">حفظ</Button>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف التصنيف"
        message={
          deleting && deleting.products_count > 0
            ? `حذف «${deleting.name}»؟ المنتجات المرتبطة (${deleting.products_count}) ستبقى بدون تصنيف.`
            : `هل تريد حذف «${deleting?.name}»؟`
        }
        loading={loading}
        confirmLabel="حذف"
      />
    </div>
  )
}
