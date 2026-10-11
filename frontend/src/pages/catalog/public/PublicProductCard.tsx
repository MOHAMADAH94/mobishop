import { Link } from 'react-router-dom'
import type { PublicCatalogProduct } from '../../../types'

export function PublicProductCard({
  product,
  storeSlug,
  currency,
  showPrices,
}: {
  product: PublicCatalogProduct
  storeSlug: string
  currency: string
  showPrices: boolean
}) {
  const productUrl = `/shop/${storeSlug}/product/${product.id}`

  return (
    <Link
      to={productUrl}
      className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] transition-shadow hover:shadow-md"
    >
      <div className="aspect-square overflow-hidden bg-[var(--bg-muted)]">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-4xl text-[var(--text-muted)]">📱</div>
        )}
      </div>
      <div className="p-4">
        {product.category_name && (
          <p className="mb-1 text-xs text-[var(--text-muted)]">{product.category_name}</p>
        )}
        <h3 className="font-semibold leading-snug">{product.name}</h3>
        {showPrices && product.sell_price != null && (
          <p className="mt-2 text-lg font-bold text-[var(--primary)]">
            {product.sell_price} {currency}
          </p>
        )}
        {!product.in_stock && (
          <span className="mt-2 inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
            غير متوفر
          </span>
        )}
        {product.is_offer && (
          <span className="mt-2 ms-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            عرض
          </span>
        )}
      </div>
    </Link>
  )
}
