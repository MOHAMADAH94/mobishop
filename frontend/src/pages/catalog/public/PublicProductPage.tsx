import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight } from 'lucide-react'
import { publicApi } from '../../../lib/publicApi'
import type { PublicCatalogCategory, PublicCatalogProduct, PublicCatalogStore } from '../../../types'
import { PublicShopShell } from './PublicShopLayout'
import { PublicCatalogNotFound } from './PublicCatalogNotFound'

interface DetailResponse {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  product: PublicCatalogProduct
}

export function PublicProductPage() {
  const { slug, productId } = useParams<{ slug: string; productId: string }>()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug || !productId) return
    setData(null)
    setNotFound(false)
    publicApi
      .get<DetailResponse>(`/public/shop/${slug}/products/${productId}/`)
      .then(({ data: res }) => setData(res))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true)
      })
  }, [slug, productId])

  if (notFound) return <PublicCatalogNotFound />

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const { store, categories, product } = data
  const backTo = product.category_slug
    ? `/shop/${store.slug}/category/${product.category_slug}`
    : `/shop/${store.slug}/products`

  return (
    <PublicShopShell
      store={store}
      categories={categories}
      navActive={product.category_slug || 'all'}
    >
      <Link
        to={backTo}
        className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للتصنيف
      </Link>
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-[var(--bg-muted)]">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-8xl text-[var(--text-muted)]">📱</div>
          )}
        </div>
        <div>
          {product.category_name && product.category_slug && (
            <Link
              to={`/shop/${store.slug}/category/${product.category_slug}`}
              className="text-sm text-[var(--primary)] hover:underline"
            >
              {product.category_name}
            </Link>
          )}
          <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
          {store.show_prices && product.sell_price != null && (
            <p className="mt-4 text-3xl font-bold text-[var(--primary)]">
              {product.sell_price} {store.currency}
            </p>
          )}
          <div className="mt-4">
            {product.in_stock ? (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-800">متوفر</span>
            ) : (
              <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">غير متوفر</span>
            )}
            {product.is_offer && (
              <span className="ms-2 rounded-full bg-amber-100 px-3 py-1 text-sm text-amber-800">عرض خاص</span>
            )}
          </div>
          {product.description && (
            <p className="mt-6 leading-relaxed text-[var(--text-muted)]">{product.description}</p>
          )}
        </div>
      </div>
    </PublicShopShell>
  )
}
