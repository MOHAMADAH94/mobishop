import { Link, useSearchParams } from 'react-router-dom'
import type { PublicCatalogCategory, PublicCatalogStore } from '../../../types'

export function PublicCategoryNav({
  store,
  categories,
  active,
}: {
  store: PublicCatalogStore
  categories: PublicCatalogCategory[]
  active: 'home' | 'all' | 'offers' | string
}) {
  const [searchParams] = useSearchParams()
  const q = searchParams.get('q')
  const query = q ? `?q=${encodeURIComponent(q)}` : ''

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-3">
      <NavPill to={`/shop/${store.slug}`} active={active === 'home'}>
        الرئيسية
      </NavPill>
      <NavPill to={`/shop/${store.slug}/products${query}`} active={active === 'all'}>
        كل المنتجات
      </NavPill>
      {categories.map((c) => (
        <NavPill
          key={c.id}
          to={`/shop/${store.slug}/category/${encodeURIComponent(c.slug)}${query}`}
          active={active === c.slug}
        >
          {c.name}
        </NavPill>
      ))}
      <NavPill to={`/shop/${store.slug}/offers`} active={active === 'offers'}>
        العروض
      </NavPill>
    </nav>
  )
}

function NavPill({
  to,
  active,
  children,
}: {
  to: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--primary)] text-white'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-muted)]'
      }`}
    >
      {children}
    </Link>
  )
}
