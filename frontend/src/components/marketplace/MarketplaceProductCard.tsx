import { useNavigate } from 'react-router-dom'
import type { MarketplaceProduct } from '../../types'

export function MarketplaceProductCardView({ product }: { product: MarketplaceProduct }) {
  const navigate = useNavigate()

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/product/${product.catalog_slug}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/product/${product.catalog_slug}`)}
      className="group cursor-pointer overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] transition-shadow hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-[var(--bg-muted)]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl">📱</div>
        )}
      </div>
      <div className="p-4">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/shop/${product.store_slug}`)
          }}
          className="text-xs text-[var(--primary)] hover:underline"
        >
          {product.store_name}
        </button>
        <h3 className="mt-1 font-semibold leading-snug">{product.name}</h3>
        {product.sell_price != null && (
          <p className="mt-2 text-lg font-bold text-[var(--primary)]">{product.sell_price}</p>
        )}
        <div className="mt-2 flex gap-2">
          {product.in_stock ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">متوفر</span>
          ) : (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">غير متوفر</span>
          )}
          {product.is_offer && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">عرض</span>
          )}
        </div>
      </div>
    </article>
  )
}
