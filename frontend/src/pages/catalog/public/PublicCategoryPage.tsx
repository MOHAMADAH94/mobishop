import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { publicApi } from '../../../lib/publicApi'
import type { PublicCatalogCategory, PublicCatalogProduct, PublicCatalogStore } from '../../../types'
import { PublicShopShell } from './PublicShopLayout'
import { PublicProductCard } from './PublicProductCard'
import { PublicCatalogNotFound } from './PublicCatalogNotFound'
import { useDebouncedCatalogSearch } from '../../../hooks/useDebouncedCatalogSearch'

interface CategoryResponse {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  category: PublicCatalogCategory
  products: PublicCatalogProduct[]
}

export function PublicCategoryPage() {
  const { slug, categorySlug } = useParams<{ slug: string; categorySlug: string }>()
  const { draft, setDraft, query } = useDebouncedCatalogSearch()
  const [data, setData] = useState<CategoryResponse | null>(null)
  const [products, setProducts] = useState<PublicCatalogProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    loadedRef.current = false
  }, [slug, categorySlug])

  useEffect(() => {
    if (!slug || !categorySlug) return
    let cancelled = false
    const isInitial = !loadedRef.current
    if (isInitial) setNotFound(false)
    else setLoadingProducts(true)

    publicApi
      .get<CategoryResponse>(`/public/shop/${slug}/categories/${categorySlug}/`, {
        params: query ? { q: query } : {},
      })
      .then(({ data: res }) => {
        if (cancelled) return
        loadedRef.current = true
        setData(res)
        setProducts(res.products)
        setNotFound(false)
      })
      .catch((err) => {
        if (cancelled) return
        if (axios.isAxiosError(err) && err.response?.status === 404) {
          if (isInitial) setNotFound(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug, categorySlug, query])

  if (notFound) return <PublicCatalogNotFound />

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const { store, categories, category } = data

  return (
    <PublicShopShell store={store} categories={categories} navActive={category.slug} showMap>
      <div className="mb-6">
        <h2 className="text-xl font-bold">{category.name}</h2>
        {category.description && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{category.description}</p>
        )}
        <p className="mt-1 text-xs text-[var(--text-muted)]">{category.products_count} منتج</p>
      </div>
      <div className="mb-6">
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="بحث في هذا التصنيف..."
          className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm"
          autoComplete="off"
        />
      </div>
      {loadingProducts ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
        </div>
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-muted)]">
          {query ? 'لا توجد نتائج.' : 'لا توجد منتجات في هذا التصنيف.'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <PublicProductCard
              key={p.id}
              product={p}
              storeSlug={store.slug}
              currency={store.currency}
              showPrices={store.show_prices}
            />
          ))}
        </div>
      )}
    </PublicShopShell>
  )
}
