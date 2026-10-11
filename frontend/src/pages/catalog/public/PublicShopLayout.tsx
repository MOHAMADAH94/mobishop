import { PublicCategoryNav } from './PublicCategoryNav'
import { Phone, MessageCircle } from 'lucide-react'
import type { PublicCatalogCategory, PublicCatalogStore } from '../../../types'
import { StoreLocationMap } from '../../../components/catalog/StoreLocationMap'

export function PublicShopShell({
  store,
  categories,
  navActive,
  children,
  showMap = false,
}: {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  navActive: 'home' | 'all' | 'offers' | string
  children: React.ReactNode
  showMap?: boolean
}) {
  const whatsappLink = store.whatsapp
    ? `https://wa.me/${store.whatsapp.replace(/\D/g, '')}`
    : null

  return (
    <div className="min-h-screen bg-[var(--bg)]" dir="rtl">
      {store.banner_url && (
        <div className="h-40 w-full overflow-hidden sm:h-52">
          <img src={store.banner_url} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <header className="border-b border-[var(--border)] bg-[var(--bg-card)]">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          {store.logo_url ? (
            <img src={store.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-xl font-bold text-[var(--primary)]">
              {store.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{store.name}</h1>
            {store.description && (
              <p className="line-clamp-2 text-sm text-[var(--text-muted)]">{store.description}</p>
            )}
            {store.address && (
              <p className="mt-1 truncate text-xs text-[var(--text-muted)]">{store.address}</p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            {store.contact_phone && (
              <a
                href={`tel:${store.contact_phone}`}
                className="flex items-center gap-1 rounded-lg bg-[var(--bg-muted)] px-3 py-2 text-sm"
              >
                <Phone className="h-4 w-4" />
                اتصل
              </a>
            )}
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
              >
                <MessageCircle className="h-4 w-4" />
                واتساب
              </a>
            )}
          </div>
        </div>
        <PublicCategoryNav store={store} categories={categories} active={navActive} />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {children}
        {showMap && (
          <StoreLocationMap
            address={store.address}
            latitude={store.latitude}
            longitude={store.longitude}
            storeName={store.name}
          />
        )}
      </main>
    </div>
  )
}
