import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { publicApi } from '../../lib/publicApi'
import { usePageMeta } from '../../hooks/usePageMeta'
import { MarketplaceLayout } from './MarketplaceLayout'
import { MarketplaceProductCardView } from '../../components/marketplace/MarketplaceProductCard'
import type { MarketplaceProduct } from '../../types'

interface ProductsData {
  products: MarketplaceProduct[]
  categories: { slug: string; name: string; products_count: number }[]
  stores: { slug: string; name: string }[]
}

export function MarketplaceProductsPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const category = params.get('category') || ''
  const store = params.get('store') || ''
  const availability = params.get('availability') || ''
  const [data, setData] = useState<ProductsData | null>(null)
  const [loading, setLoading] = useState(true)

  usePageMeta({
    title: 'جميع المنتجات',
    description: 'ابحث وتصفّح المنتجات من جميع المتاجر في سوق موبي شوب.',
  })

  useEffect(() => {
    setLoading(true)
    const query: Record<string, string> = {}
    if (q) query.q = q
    if (category) query.category = category
    if (store) query.store = store
    if (availability) query.availability = availability
    publicApi
      .get<ProductsData>('/public/marketplace/products/', { params: query })
      .then(({ data: res }) => setData(res))
      .finally(() => setLoading(false))
  }, [q, category, store, availability])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next)
  }

  return (
    <MarketplaceLayout>
      <h1 className="mb-6 text-2xl font-bold">جميع المنتجات</h1>
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setFilter('q', e.target.value)}
          placeholder="بحث بالمنتج أو التصنيف..."
          className="min-w-[200px] flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm"
        />
        <select
          value={store}
          onChange={(e) => setFilter('store', e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
        >
          <option value="">كل المتاجر</option>
          {data?.stores.map((s) => (
            <option key={s.slug} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setFilter('category', e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
        >
          <option value="">كل التصنيفات</option>
          {data?.categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name} ({c.products_count})</option>
          ))}
        </select>
        <select
          value={availability}
          onChange={(e) => setFilter('availability', e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
        >
          <option value="">كل الحالات</option>
          <option value="in_stock">متوفر</option>
          <option value="out_of_stock">غير متوفر</option>
        </select>
      </div>
      {loading ? (
        <p className="py-16 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : !data?.products.length ? (
        <p className="py-16 text-center text-[var(--text-muted)]">لا توجد منتجات.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.products.map((p) => (
            <MarketplaceProductCardView key={`${p.store_slug}-${p.id}`} product={p} />
          ))}
        </div>
      )}
    </MarketplaceLayout>
  )
}
