import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { publicApi } from '../../../lib/publicApi'
import type { PublicCatalogCategory, PublicCatalogProduct, PublicCatalogStore } from '../../../types'
import { PublicShopShell } from './PublicShopLayout'
import { PublicProductCard } from './PublicProductCard'
import { PublicCatalogNotFound } from './PublicCatalogNotFound'

interface OffersResponse {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  products: PublicCatalogProduct[]
}

export function PublicOffersPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<OffersResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    setData(null)
    setNotFound(false)
    publicApi
      .get<OffersResponse>(`/public/shop/${slug}/offers/`)
      .then(({ data: res }) => setData(res))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true)
      })
  }, [slug])

  if (notFound) return <PublicCatalogNotFound />

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const { store, categories, products } = data

  return (
    <PublicShopShell store={store} categories={categories} navActive="offers">
      <h2 className="mb-6 text-xl font-bold">العروض</h2>
      {products.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-muted)]">لا توجد عروض حالياً.</p>
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
