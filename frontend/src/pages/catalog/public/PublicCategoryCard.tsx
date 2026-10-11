import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import type { PublicCatalogCategory } from '../../../types'

export function PublicCategoryCard({
  category,
  storeSlug,
}: {
  category: PublicCatalogCategory
  storeSlug: string
}) {
  return (
    <Link
      to={`/shop/${storeSlug}/category/${encodeURIComponent(category.slug)}`}
      className="group flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 transition-shadow hover:shadow-md"
    >
      <div>
        <h3 className="font-semibold group-hover:text-[var(--primary)]">{category.name}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{category.products_count} منتج</p>
        {category.featured && (
          <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            مميز
          </span>
        )}
      </div>
      <ChevronLeft className="h-5 w-5 shrink-0 text-[var(--text-muted)] group-hover:text-[var(--primary)]" />
    </Link>
  )
}
