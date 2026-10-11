import { useEffect, useState } from 'react'
import { publicApi } from '../../lib/publicApi'
import { usePageMeta } from '../../hooks/usePageMeta'
import { MarketplaceLayout } from './MarketplaceLayout'
import { MarketplaceStoreCardView } from '../../components/marketplace/MarketplaceStoreCard'
import type { MarketplaceStoreCard } from '../../types'

export function MarketplaceStoresPage() {
  const [search, setSearch] = useState('')
  const [stores, setStores] = useState<MarketplaceStoreCard[]>([])
  const [loading, setLoading] = useState(true)

  usePageMeta({
    title: 'دليل المتاجر',
    description: 'تصفّح جميع المتاجر في سوق موبي شوب — محلات موبايلات وإكسسوارات.',
  })

  useEffect(() => {
    setLoading(true)
    publicApi
      .get<{ stores: MarketplaceStoreCard[] }>('/public/marketplace/stores/', {
        params: search ? { q: search } : {},
      })
      .then(({ data }) => setStores(data.stores))
      .finally(() => setLoading(false))
  }, [search])

  return (
    <MarketplaceLayout>
      <h1 className="mb-2 text-2xl font-bold">دليل المتاجر</h1>
      <p className="mb-6 text-sm text-[var(--text-muted)]">جميع المتاجر ذات المعرض العام المفعّل</p>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث باسم المتجر أو الوصف..."
        className="mb-8 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm"
      />
      {loading ? (
        <p className="py-16 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : stores.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-muted)]">لا توجد متاجر مطابقة.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((s) => (
            <MarketplaceStoreCardView key={s.slug} store={s} />
          ))}
        </div>
      )}
    </MarketplaceLayout>
  )
}
