import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import { publicApi } from '../../../lib/publicApi'
import type { PublicCatalogCategory, PublicCatalogStore } from '../../../types'
import { PublicShopShell } from './PublicShopLayout'
import { PublicCategoryCard } from './PublicCategoryCard'
import { PublicCatalogNotFound } from './PublicCatalogNotFound'

interface HomeResponse {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
}

export function PublicShopPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<HomeResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    setData(null)
    setNotFound(false)
    publicApi
      .get<HomeResponse>(`/public/shop/${slug}/`)
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

  const { store, categories } = data
  const featured = categories.filter((c) => c.featured)
  const regular = categories.filter((c) => !c.featured)

  return (
    <PublicShopShell store={store} categories={categories} navActive="home" showMap>
      {categories.length === 0 ? (
        <p className="py-16 text-center text-[var(--text-muted)]">
          لا توجد تصنيفات في المعرض حالياً.
          <span className="mt-2 block text-xs">
            أضف تصنيفات للمنتجات وفعّل «عرض في المعرض» من صفحة التصنيفات.
          </span>
        </p>
      ) : (
        <div className="space-y-8">
          {featured.length > 0 && (
            <section>
              <h2 className="mb-4 text-lg font-bold">تصنيفات مميزة</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {featured.map((c) => (
                  <PublicCategoryCard key={c.id} category={c} storeSlug={store.slug} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="mb-4 text-lg font-bold">
              {featured.length > 0 ? 'جميع التصنيفات' : 'تصفح حسب التصنيف'}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(featured.length > 0 ? regular : categories).map((c) => (
                <PublicCategoryCard key={c.id} category={c} storeSlug={store.slug} />
              ))}
            </div>
          </section>
        </div>
      )}
    </PublicShopShell>
  )
}
