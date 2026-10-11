import { useEffect, useState } from 'react'
import { publicApi } from '../../lib/publicApi'
import { usePageMeta } from '../../hooks/usePageMeta'
import { MarketplaceLayout } from './MarketplaceLayout'
import { MarketplaceProductCardView } from '../../components/marketplace/MarketplaceProductCard'
import type { MarketplaceProduct } from '../../types'

export function MarketplaceOffersPage() {
  const [products, setProducts] = useState<MarketplaceProduct[]>([])
  const [loading, setLoading] = useState(true)

  usePageMeta({
    title: 'العروض والتخفيضات',
    description: 'أفضل العروض من جميع متاجر سوق موبي شوب.',
  })

  useEffect(() => {
    publicApi
      .get<{ products: MarketplaceProduct[] }>('/public/marketplace/offers/')
      .then(({ data }) => setProducts(data.products))
      .finally(() => setLoading(false))
  }, [])

  return (
    <MarketplaceLayout>
      <div className="mb-8 rounded-2xl bg-gradient-to-l from-amber-500 to-orange-600 px-6 py-8 text-white">
        <h1 className="text-2xl font-bold">العروض الخاصة</h1>
        <p className="mt-2 text-white/90">منتجات مخفّضة ومميزة من متاجر السوق</p>
      </div>
      {loading ? (
        <p className="py-16 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : products.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-muted)]">لا توجد عروض حالياً.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <MarketplaceProductCardView key={`${p.store_slug}-${p.id}`} product={p} />
          ))}
        </div>
      )}
    </MarketplaceLayout>
  )
}
