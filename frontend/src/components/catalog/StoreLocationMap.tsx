import { MapPin, ExternalLink } from 'lucide-react'

function osmEmbedUrl(lat: number, lng: number) {
  const delta = 0.01
  const left = lng - delta
  const right = lng + delta
  const top = lat + delta
  const bottom = lat - delta
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${lat}%2C${lng}`
}

function mapsLink(lat: number, lng: number, address?: string) {
  const q = address?.trim()
    ? encodeURIComponent(address.trim())
    : `${lat},${lng}`
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function StoreLocationMap({
  address,
  latitude,
  longitude,
  storeName,
}: {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  storeName?: string
}) {
  const lat = latitude != null ? Number(latitude) : NaN
  const lng = longitude != null ? Number(longitude) : NaN
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  const hasAddress = Boolean(address?.trim())

  if (!hasCoords && !hasAddress) return null

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <MapPin className="h-4 w-4 shrink-0 text-[var(--primary)]" />
            موقع المحل
          </h2>
          {hasAddress && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{address}</p>
          )}
          {storeName && !hasAddress && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{storeName}</p>
          )}
        </div>
        {hasCoords && (
          <a
            href={mapsLink(lat, lng, address || undefined)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-sm text-[var(--primary)] hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            فتح في الخرائط
          </a>
        )}
      </div>
      {hasCoords ? (
        <iframe
          title="خريطة موقع المحل"
          src={osmEmbedUrl(lat, lng)}
          className="h-56 w-full border-0 sm:h-72"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <p className="px-4 py-6 text-sm text-[var(--text-muted)]">
          العنوان متاح كنص — أضف إحداثيات الخريطة من إعدادات المعرض لعرض الموقع على الخريطة.
        </p>
      )}
    </section>
  )
}
