import { Link } from 'react-router-dom'
import type { MarketplaceStoreCard } from '../../types'

export function MarketplaceStoreCardView({ store }: { store: MarketplaceStoreCard }) {
  return (
    <Link
      to={`/shop/${store.slug}`}
      className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] transition-shadow hover:shadow-lg"
    >
      <div className="flex items-center gap-4 p-4">
        {store.logo_url ? (
          <img src={store.logo_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-2xl font-bold text-[var(--primary)]">
            {store.name.charAt(0)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold group-hover:text-[var(--primary)]">{store.name}</h3>
            {store.featured && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">مميز</span>
            )}
          </div>
          {store.description && (
            <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{store.description}</p>
          )}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {store.products_count} منتج
          </p>
        </div>
      </div>
    </Link>
  )
}
