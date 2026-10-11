import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { publicApi } from '../../lib/publicApi'
import { usePageMeta } from '../../hooks/usePageMeta'
import { MarketplaceLayout } from './MarketplaceLayout'
import { MarketplaceStoreCardView } from '../../components/marketplace/MarketplaceStoreCard'
import { MarketplaceProductCardView } from '../../components/marketplace/MarketplaceProductCard'
import type { MarketplaceProduct, MarketplaceStoreCard } from '../../types'

interface HomeData {
  featured_stores: MarketplaceStoreCard[]
  new_stores: MarketplaceStoreCard[]
  latest_products: MarketplaceProduct[]
  offers: MarketplaceProduct[]
}

export function MarketplaceHomePage() {
  const [data, setData] = useState<HomeData | null>(null)

  usePageMeta({
    title: 'سوق موبي شوب — اكتشف المتاجر والمنتجات',
    description: 'تصفّح متاجر الموبايلات والإكسسوارات، اكتشف أحدث المنتجات والعروض في سوق موبي شوب.',
    url: window.location.href,
  })

  useEffect(() => {
    publicApi.get<HomeData>('/public/marketplace/').then(({ data: res }) => setData(res))
  }, [])

  if (!data) {
    return (
      <MarketplaceLayout>
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
        </div>
      </MarketplaceLayout>
    )
  }

  return (
    <MarketplaceLayout>
      <section className="mb-12 rounded-3xl bg-gradient-to-l from-[var(--primary)] to-blue-700 px-8 py-12 text-white">
        <h1 className="text-3xl font-bold sm:text-4xl">اكتشف أفضل متاجر الموبايلات</h1>
        <p className="mt-3 max-w-xl text-white/90">
          سوق موحّد لتصفّح المتاجر والمنتجات والعروض — بدون تسجيل.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/marketplace/stores"
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-[var(--primary)]"
          >
            تصفّح المتاجر
          </Link>
          <Link
            to="/marketplace/offers"
            className="rounded-xl border border-white/40 px-5 py-2.5 text-sm font-medium text-white"
          >
            العروض الخاصة
          </Link>
        </div>
      </section>

      {data.featured_stores.length > 0 && (
        <Section title="متاجر مميزة" link="/marketplace/stores">
          <div className="grid gap-4 sm:grid-cols-2">
            {data.featured_stores.map((s) => (
              <MarketplaceStoreCardView key={s.slug} store={s} />
            ))}
          </div>
        </Section>
      )}

      {data.offers.length > 0 && (
        <Section title="عروض مميزة" link="/marketplace/offers">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.offers.map((p) => (
              <MarketplaceProductCardView key={`${p.store_slug}-${p.id}`} product={p} />
            ))}
          </div>
        </Section>
      )}

      {data.latest_products.length > 0 && (
        <Section title="أحدث المنتجات" link="/marketplace/products">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.latest_products.map((p) => (
              <MarketplaceProductCardView key={`${p.store_slug}-${p.id}`} product={p} />
            ))}
          </div>
        </Section>
      )}

      {data.new_stores.length > 0 && (
        <Section title="متاجر جديدة" link="/marketplace/stores">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.new_stores.map((s) => (
              <MarketplaceStoreCardView key={s.slug} store={s} />
            ))}
          </div>
        </Section>
      )}
    </MarketplaceLayout>
  )
}

function Section({
  title,
  link,
  children,
}: {
  title: string
  link: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">{title}</h2>
        <Link to={link} className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline">
          عرض الكل
          <ArrowLeft className="h-4 w-4" />
        </Link>
      </div>
      {children}
    </section>
  )
}
