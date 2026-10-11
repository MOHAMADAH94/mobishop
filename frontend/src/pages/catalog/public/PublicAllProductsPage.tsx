import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { publicApi } from '../../../lib/publicApi'
import type { PublicCatalogCategory, PublicCatalogProduct, PublicCatalogStore } from '../../../types'
import { PublicShopShell } from './PublicShopLayout'
import { PublicProductCard } from './PublicProductCard'
import { PublicCatalogNotFound } from './PublicCatalogNotFound'
import { useDebouncedCatalogSearch } from '../../../hooks/useDebouncedCatalogSearch'

interface ProductsResponse {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  products: PublicCatalogProduct[]
}

export function PublicAllProductsPage() {
  const { slug } = useParams<{ slug: string }>()
  const { draft, setDraft, query } = useDebouncedCatalogSearch()
  const [data, setData] = useState<ProductsResponse | null>(null)
  const [products, setProducts] = useState<PublicCatalogProduct[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    loadedRef.current = false
  }, [slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    const isInitial = !loadedRef.current
    if (isInitial) setNotFound(false)
    else setLoadingProducts(true)

    publicApi
      .get<ProductsResponse>(`/public/shop/${slug}/products/`, {
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
  }, [slug, query])

  if (notFound) return <PublicCatalogNotFound />

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const { store, categories } = data

  return (
    <PublicShopShell store={store} categories={categories} navActive="all" showMap>
      <div className="mb-6">
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="بحث بالمنتج أو التصنيف..."
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
          {query ? 'لا توجد نتائج للبحث.' : 'لا توجد منتجات منشورة في المعرض حالياً.'}
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
