import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Package, Trash2, Store, Printer, Wand2 } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ConfirmModal } from '../../components/ui/ConfirmModal'
import { TableScroll } from '../../components/ui/TableScroll'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { hasPermission } from '../../lib/permissions'
import { formatMoney } from '../../lib/utils'
import { formatQtyDisplay } from '../../lib/quantity'
import { Pagination } from '../../components/ui/Pagination'
import { cachedProductToProduct, getCachedProducts } from '../../offline/cache'
import type { Category, Paginated, Product } from '../../types'

type BulkAction = 'publish_catalog' | 'unpublish_catalog' | 'mark_offer' | 'unmark_offer' | 'deactivate' | 'activate' | 'set_category'
type AvailabilityFilter = '' | 'in_stock' | 'out_of_stock' | 'low_stock'
type CatalogFilter = '' | 'published' | 'unpublished' | 'offers'
type ActiveFilter = 'active' | 'inactive' | 'all'

function stockBadge(product: Product) {
  if (product.quantity <= 0) {
    return <Badge variant="danger">غير متوفر</Badge>
  }
  if (product.is_low_stock) {
    return <Badge variant="warning">منخفض</Badge>
  }
  return <Badge variant="success">متوفر</Badge>
}

export function ProductsPage() {
  const store = useCurrentStore()
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const catalogEnabled = Boolean(store?.catalog_enabled)
  const currency = store?.currency
  const storeVersion = useStoreVersion()
  const canManage = hasPermission(store?.role, 'products')
  const toast = useToastStore((s) => s.add)
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [availability, setAvailability] = useState<AvailabilityFilter>('')
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkCategoryId, setBulkCategoryId] = useState('')
  const [pendingBulk, setPendingBulk] = useState<BulkAction | null>(null)
  const [generatingBarcodeId, setGeneratingBarcodeId] = useState<number | null>(null)

  useEffect(() => {
    refreshStores().catch(() => {})
  }, [refreshStores])

  useEffect(() => {
    api
      .get<Category[] | { results: Category[] }>('/products/categories/')
      .then(({ data }) => {
        setCategories(Array.isArray(data) ? data : data.results ?? [])
      })
      .catch(() => setCategories([]))
  }, [storeVersion])

  useEffect(() => {
    setPage(1)
    setSelected([])
  }, [search, categoryId, availability, catalogFilter, activeFilter, storeVersion])

  const toggleCatalogPublish = async (product: Product) => {
    setTogglingId(product.id)
    const next = !product.publish_in_catalog
    try {
      await api.patch(`/products/${product.id}/`, { publish_in_catalog: next })
      setProducts((list) =>
        list.map((p) => (p.id === product.id ? { ...p, publish_in_catalog: next } : p)),
      )
      toast(next ? 'تم نشر المنتج في المعرض' : 'تم إخفاء المنتج من المعرض', 'success')
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setTogglingId(null)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      if (!navigator.onLine && store?.id) {
        let cached = await getCachedProducts(store.id)
        if (search.trim()) {
          const q = search.trim().toLowerCase()
          cached = cached.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              (p.sku || '').toLowerCase().includes(q) ||
              (p.barcode || '').toLowerCase().includes(q),
          )
        }
        if (categoryId) {
          const cid = parseInt(categoryId, 10)
          cached = cached.filter((p) => p.category === cid)
        }
        if (availability === 'in_stock') cached = cached.filter((p) => p.quantity > 0)
        else if (availability === 'out_of_stock') cached = cached.filter((p) => p.quantity <= 0)
        else if (availability === 'low_stock') {
          cached = cached.filter((p) => p.quantity > 0 && p.quantity <= p.low_stock_threshold)
        }
        cached = cached.filter((p) => p.is_active !== false)
        cached.sort((a, b) => b.id - a.id)
        const pageSize = 20
        const start = (page - 1) * pageSize
        const slice = cached.slice(start, start + pageSize)
        setProducts(slice.map(cachedProductToProduct))
        setTotalCount(cached.length)
        return
      }
      const params: Record<string, string> = { search, page: String(page) }
      if (categoryId) params.category = categoryId
      if (availability) params.availability = availability
      if (catalogFilter) params.catalog = catalogFilter
      if (activeFilter === 'inactive') params.is_active = 'false'
      else if (activeFilter === 'all') params.is_active = 'all'
      const { data } = await api.get<Paginated<Product>>('/products/', { params })
      setProducts(data.results)
      setTotalCount(data.count)
    } catch (e) {
      if (store?.id) {
        try {
          const cached = await getCachedProducts(store.id)
          setProducts(cached.filter((p) => p.is_active !== false).map(cachedProductToProduct))
          setTotalCount(cached.length)
          return
        } catch {
          /* fall through */
        }
      }
      toast(getErrorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [search, categoryId, availability, catalogFilter, activeFilter, storeVersion, page])

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await api.delete(`/products/${deleting.id}/`)
      toast('تم حذف المنتج', 'success')
      setSelected((ids) => ids.filter((id) => id !== deleting.id))
      setDeleting(null)
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const runBulk = async (action: BulkAction) => {
    if (selected.length === 0) return
    if (action === 'set_category' && !bulkCategoryId) {
      toast('اختر تصنيفاً أولاً', 'error')
      return
    }
    setBulkLoading(true)
    try {
      const { data } = await api.post<{ updated: number }>('/products/bulk/', {
        ids: selected,
        action,
        ...(action === 'set_category' ? { category_id: parseInt(bulkCategoryId, 10) } : {}),
      })
      const labels: Record<BulkAction, string> = {
        publish_catalog: 'تم نشر المنتجات في المعرض',
        unpublish_catalog: 'تم إخفاء المنتجات من المعرض',
        mark_offer: 'تم تمييز المنتجات كعروض',
        unmark_offer: 'تم إلغاء تمييز العروض',
        deactivate: 'تم حذف المنتجات من القائمة',
        activate: 'تم استعادة المنتجات للقائمة',
        set_category: 'تم نقل المنتجات إلى التصنيف',
      }
      toast(`${labels[action]} (${data.updated})`, 'success')
      setSelected([])
      setPendingBulk(null)
      load()
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setBulkLoading(false)
    }
  }

  const requestBulk = (action: BulkAction) => {
    if (action === 'deactivate') {
      setPendingBulk(action)
      return
    }
    runBulk(action)
  }

  const generateBarcodeFor = async (product: Product) => {
    setGeneratingBarcodeId(product.id)
    try {
      const { data } = await api.post<{ barcode: string; generated: boolean; detail?: string }>(
        `/products/${product.id}/generate-barcode/`,
      )
      setProducts((list) =>
        list.map((p) => (p.id === product.id ? { ...p, barcode: data.barcode } : p)),
      )
      toast(
        data.generated ? `تم توليد باركود لـ «${product.name}»` : data.detail || 'الباركود موجود مسبقاً',
        'success',
      )
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setGeneratingBarcodeId(null)
    }
  }

  const barcodePrintHref =
    selected.length > 0 ? `/products/barcode-print?ids=${selected.join(',')}` : '/products/barcode-print'

  const pageIds = products.map((p) => p.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id))
  const togglePage = () => {
    if (allPageSelected) {
      setSelected((ids) => ids.filter((id) => !pageIds.includes(id)))
    } else {
      setSelected((ids) => Array.from(new Set([...ids, ...pageIds])))
    }
  }
  const toggleOne = (id: number) => {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  const hasFilters = Boolean(search.trim() || categoryId || availability || catalogFilter)
  const clearFilters = () => {
    setSearch('')
    setCategoryId('')
    setAvailability('')
    setCatalogFilter('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">المنتجات</h1>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link to={barcodePrintHref}>
              <Button variant="secondary">
                <Printer className="h-4 w-4" />
                طباعة باركود
                {selected.length > 0 ? ` (${selected.length})` : ''}
              </Button>
            </Link>
            <Link to="/products/new">
              <Button>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Button>
            </Link>
          </div>
        )}
      </div>
      {catalogEnabled && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-4 py-3 text-sm">
          <Store className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
          <p className="text-[var(--text-muted)]">
            حدّد عدة منتجات ثم استخدم الإجراءات الجماعية لنشرها في المعرض أو تمييزها كعروض، أو اضغط شارة المعرض في الجدول لكل منتج.
          </p>
        </div>
      )}
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              placeholder="بحث بالاسم، SKU، الباركود..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="mobishop-select min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
            aria-label="التصنيف"
          >
            <option value="">كل التصنيفات</option>
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
                {typeof c.products_count === 'number' ? ` (${c.products_count})` : ''}
              </option>
            ))}
          </select>
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value as AvailabilityFilter)}
            className="mobishop-select min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
            aria-label="التوفر"
          >
            <option value="">كل الحالات</option>
            <option value="in_stock">متوفر</option>
            <option value="low_stock">مخزون منخفض</option>
            <option value="out_of_stock">غير متوفر</option>
          </select>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
            className="mobishop-select min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
            aria-label="حالة المنتج"
          >
            <option value="active">نشط فقط</option>
            <option value="inactive">محذوف / غير نشط</option>
            <option value="all">الكل</option>
          </select>
          {catalogEnabled && (
            <select
              value={catalogFilter}
              onChange={(e) => setCatalogFilter(e.target.value as CatalogFilter)}
              className="mobishop-select min-w-[150px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
              aria-label="المعرض"
            >
              <option value="">كل المعرض</option>
              <option value="published">منشور</option>
              <option value="unpublished">غير منشور</option>
              <option value="offers">عروض</option>
            </select>
          )}
          {hasFilters && (
            <Button variant="secondary" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          )}
        </div>
        {canManage && selected.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 p-3">
            <span className="text-sm font-medium">تم تحديد {selected.length}</span>
            <Link to={barcodePrintHref}>
              <Button size="sm" variant="secondary">
                <Printer className="h-4 w-4" />
                طباعة باركود
              </Button>
            </Link>
            {catalogEnabled && (
              <>
                <Button size="sm" variant="secondary" disabled={bulkLoading} onClick={() => requestBulk('publish_catalog')}>
                  نشر في المعرض
                </Button>
                <Button size="sm" variant="secondary" disabled={bulkLoading} onClick={() => requestBulk('unpublish_catalog')}>
                  إخفاء من المعرض
                </Button>
                <Button size="sm" variant="secondary" disabled={bulkLoading} onClick={() => requestBulk('mark_offer')}>
                  تمييز كعرض
                </Button>
                <Button size="sm" variant="secondary" disabled={bulkLoading} onClick={() => requestBulk('unmark_offer')}>
                  إلغاء العرض
                </Button>
              </>
            )}
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="mobishop-select min-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-sm"
              aria-label="تصنيف النقل"
            >
              <option value="">نقل إلى تصنيف...</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={bulkLoading || !bulkCategoryId}
              onClick={() => requestBulk('set_category')}
            >
              نقل
            </Button>
            <Button size="sm" variant="danger" disabled={bulkLoading} onClick={() => requestBulk('deactivate')}>
              حذف المحدد
            </Button>
            <Button size="sm" variant="secondary" disabled={bulkLoading} onClick={() => requestBulk('activate')}>
              استعادة المحدد
            </Button>
            <Button size="sm" variant="ghost" disabled={bulkLoading} onClick={() => setSelected([])}>
              إلغاء التحديد
            </Button>
          </div>
        )}
        {loading ? (
          <div className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={Package}
            title={hasFilters ? 'لا توجد نتائج' : 'لا توجد منتجات'}
            description={
              hasFilters
                ? 'جرّب تغيير البحث أو الفلاتر'
                : 'أضف أول منتج لمتجرك'
            }
            action={
              hasFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  مسح الفلاتر
                </Button>
              ) : canManage ? (
                <Link to="/products/new">
                  <Button>إضافة منتج</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TableScroll>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                    {canManage && (
                      <th className="w-10 py-3 text-right font-medium">
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={togglePage}
                          aria-label="تحديد كل المنتجات في الصفحة"
                        />
                      </th>
                    )}
                    <th className="py-3 text-right font-medium">المنتج</th>
                    <th className="py-3 text-right font-medium">التصنيف</th>
                    <th className="py-3 text-right font-medium">SKU</th>
                    <th className="py-3 text-right font-medium">سعر الشراء</th>
                    <th className="py-3 text-right font-medium">سعر البيع</th>
                    <th className="py-3 text-right font-medium">الكمية</th>
                    <th className="py-3 text-right font-medium">الحالة</th>
                    {catalogEnabled && (
                      <th className="py-3 text-right font-medium">المعرض</th>
                    )}
                    <th className="py-3" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-[var(--border)]/50 hover:bg-[var(--bg-muted)]/50">
                      {canManage && (
                        <td className="py-3">
                          <input
                            type="checkbox"
                            checked={selected.includes(p.id)}
                            onChange={() => toggleOne(p.id)}
                            aria-label={`تحديد ${p.name}`}
                          />
                        </td>
                      )}
                      <td className="py-3 font-medium">{p.name}</td>
                      <td className="py-3 text-[var(--text-muted)]">{p.category_name || '—'}</td>
                      <td className="py-3 text-[var(--text-muted)]">{p.sku || '—'}</td>
                      <td className="py-3">{formatMoney(p.buy_price, currency)}</td>
                      <td className="py-3">{formatMoney(p.sell_price, currency)}</td>
                      <td className="py-3">
                        {formatQtyDisplay(p.quantity, {
                          allowFractional: p.allow_fractional_quantity,
                          precision: p.quantity_precision,
                          unit: p.unit,
                        })}
                      </td>
                      <td className="py-3">{stockBadge(p)}</td>
                      {catalogEnabled && (
                        <td className="py-3">
                          {canManage ? (
                            <button
                              type="button"
                              disabled={togglingId === p.id}
                              onClick={() => toggleCatalogPublish(p)}
                              className="disabled:opacity-50"
                            >
                              {p.publish_in_catalog ? (
                                <Badge variant="primary">{p.is_catalog_offer ? 'عرض' : 'منشور'}</Badge>
                              ) : (
                                <Badge>غير منشور</Badge>
                              )}
                            </button>
                          ) : p.publish_in_catalog ? (
                            <Badge variant="primary">{p.is_catalog_offer ? 'عرض' : 'منشور'}</Badge>
                          ) : (
                            <Badge>—</Badge>
                          )}
                        </td>
                      )}
                      <td className="py-3 text-left">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {canManage && (
                            <>
                              {!p.barcode ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={generatingBarcodeId === p.id}
                                  onClick={() => generateBarcodeFor(p)}
                                  aria-label="توليد باركود"
                                  title="توليد باركود"
                                >
                                  <Wand2 className="h-4 w-4" />
                                </Button>
                              ) : (
                                <Link
                                  to={`/products/barcode-print?ids=${p.id}`}
                                  className="inline-flex"
                                  title="طباعة الباركود"
                                >
                                  <Button variant="ghost" size="sm" aria-label="طباعة الباركود">
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                </Link>
                              )}
                              <Link to={`/products/${p.id}/edit`} className="px-1 text-[var(--primary)] hover:underline">
                                تعديل
                              </Link>
                              <Button variant="ghost" size="sm" onClick={() => setDeleting(p)} aria-label="حذف">
                                <Trash2 className="h-4 w-4 text-[var(--danger)]" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            <Pagination page={page} totalCount={totalCount} onPageChange={setPage} />
          </>
        )}
      </Card>
      <ConfirmModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="حذف المنتج"
        message={`حذف «${deleting?.name}»؟ لن يظهر في القائمة أو نقطة البيع، لكن سجل المبيعات السابقة يبقى.`}
        loading={deleteLoading}
        confirmLabel="حذف"
      />
      <ConfirmModal
        open={pendingBulk === 'deactivate'}
        onClose={() => setPendingBulk(null)}
        onConfirm={() => runBulk('deactivate')}
        title="حذف المنتجات المحددة"
        message={`حذف ${selected.length} منتجاً من القائمة؟ لن تظهر في نقطة البيع، وسجلات المبيعات السابقة تبقى.`}
        loading={bulkLoading}
        confirmLabel="حذف المحدد"
      />
    </div>
  )
}
