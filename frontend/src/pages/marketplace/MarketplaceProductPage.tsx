import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, MessageCircle, Phone, Send } from 'lucide-react'
import { publicApi } from '../../lib/publicApi'
import { usePageMeta } from '../../hooks/usePageMeta'
import { MarketplaceLayout } from './MarketplaceLayout'
import type { MarketplaceProduct, PublicCatalogStore } from '../../types'

interface DetailData {
  product: MarketplaceProduct
  store: PublicCatalogStore
}

export function MarketplaceProductPage() {
  const { productSlug } = useParams<{ productSlug: string }>()
  const [data, setData] = useState<DetailData | null>(null)
  const [notFound, setNotFound] = useState(false)

  usePageMeta({
    title: data ? `${data.product.name} — ${data.store.name}` : 'تفاصيل المنتج',
    description: data?.product.description || data?.product.name,
    image: data?.product.image_url,
    url: window.location.href,
  })

  useEffect(() => {
    if (!productSlug) return
    setData(null)
    setNotFound(false)
    publicApi
      .get<DetailData>(`/public/marketplace/products/${productSlug}/`)
      .then(({ data: res }) => setData(res))
      .catch((err) => {
        if (axios.isAxiosError(err) && err.response?.status === 404) setNotFound(true)
      })
  }, [productSlug])

  if (notFound) {
    return (
      <MarketplaceLayout>
        <p className="py-24 text-center text-[var(--text-muted)]">المنتج غير موجود.</p>
      </MarketplaceLayout>
    )
  }

  if (!data) {
    return (
      <MarketplaceLayout>
        <div className="flex justify-center py-24">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
        </div>
      </MarketplaceLayout>
    )
  }

  const { product, store } = data
  const whatsapp = store.whatsapp ? `https://wa.me/${store.whatsapp.replace(/\D/g, '')}` : null
  const telegram = store.telegram
    ? store.telegram.startsWith('http')
      ? store.telegram
      : `https://t.me/${store.telegram.replace('@', '')}`
    : null

  return (
    <MarketplaceLayout>
      <Link
        to="/marketplace/products"
        className="mb-6 inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
      >
        <ArrowRight className="h-4 w-4" />
        العودة للمنتجات
      </Link>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-[var(--bg-muted)]">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square items-center justify-center text-8xl">📱</div>
          )}
        </div>
        <div>
          <Link to={`/shop/${store.slug}`} className="text-sm text-[var(--primary)] hover:underline">
            {store.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{product.name}</h1>
          {product.sell_price != null && (
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
          </div>
          {product.description && (
            <p className="mt-6 leading-relaxed text-[var(--text-muted)]">{product.description}</p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm text-white"
              >
                <MessageCircle className="h-4 w-4" />
                واتساب
              </a>
            )}
            {telegram && (
              <a
                href={telegram}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm text-white"
              >
                <Send className="h-4 w-4" />
                Telegram
              </a>
            )}
            {store.contact_phone && (
              <a
                href={`tel:${store.contact_phone}`}
                className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm"
              >
                <Phone className="h-4 w-4" />
                اتصل
              </a>
            )}
          </div>
        </div>
      </div>
    </MarketplaceLayout>
  )
}
