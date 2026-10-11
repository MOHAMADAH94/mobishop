import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Navigation, Trash2, Search } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

const DEFAULT_CENTER: [number, number] = [33.5138, 36.2765]
const DEFAULT_ZOOM = 13

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})

type Props = {
  latitude: string | number | null | undefined
  longitude: string | number | null | undefined
  address: string
  onChange: (next: {
    latitude: number | null
    longitude: number | null
    address?: string
  }) => void
}

function parseCoord(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'MobishopCatalog/1.0 (https://mobishop.online)',
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ar`,
      { headers: NOMINATIM_HEADERS },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { display_name?: string }
    return data.display_name || null
  } catch {
    return null
  }
}

async function searchPlace(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1&accept-language=ar`,
      { headers: NOMINATIM_HEADERS },
    )
    if (!res.ok) return null
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>
    if (!data.length) return null
    return {
      lat: Number(data[0].lat),
      lng: Number(data[0].lon),
      label: data[0].display_name,
    }
  } catch {
    return null
  }
}

export function LocationMapPicker({ latitude, longitude, address, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [locating, setLocating] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const lat = parseCoord(latitude)
  const lng = parseCoord(longitude)
  const hasPoint = lat != null && lng != null

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: hasPoint ? [lat!, lng!] : DEFAULT_CENTER,
      zoom: hasPoint ? 16 : DEFAULT_ZOOM,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    const placeMarker = async (nextLat: number, nextLng: number, fillAddress: boolean) => {
      if (markerRef.current) {
        markerRef.current.setLatLng([nextLat, nextLng])
      } else {
        markerRef.current = L.marker([nextLat, nextLng], { icon: markerIcon, draggable: true }).addTo(map)
        markerRef.current.on('dragend', async () => {
          const pos = markerRef.current?.getLatLng()
          if (!pos) return
          let nextAddress: string | undefined
          const label = await reverseGeocode(pos.lat, pos.lng)
          if (label) nextAddress = label
          onChangeRef.current({
            latitude: Number(pos.lat.toFixed(6)),
            longitude: Number(pos.lng.toFixed(6)),
            address: nextAddress,
          })
        })
      }

      map.panTo([nextLat, nextLng])
      let nextAddress: string | undefined
      if (fillAddress) {
        const label = await reverseGeocode(nextLat, nextLng)
        if (label) nextAddress = label
      }
      onChangeRef.current({
        latitude: Number(nextLat.toFixed(6)),
        longitude: Number(nextLng.toFixed(6)),
        address: nextAddress,
      })
    }

    map.on('click', (e: L.LeafletMouseEvent) => {
      void placeMarker(e.latlng.lat, e.latlng.lng, true)
    })

    if (hasPoint) {
      markerRef.current = L.marker([lat!, lng!], { icon: markerIcon, draggable: true }).addTo(map)
      markerRef.current.on('dragend', async () => {
        const pos = markerRef.current?.getLatLng()
        if (!pos) return
        const label = await reverseGeocode(pos.lat, pos.lng)
        onChangeRef.current({
          latitude: Number(pos.lat.toFixed(6)),
          longitude: Number(pos.lng.toFixed(6)),
          address: label || undefined,
        })
      })
    }

    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 50)

    return () => {
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (lat == null || lng == null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
      return
    }
    if (markerRef.current) {
      const current = markerRef.current.getLatLng()
      if (Math.abs(current.lat - lat) > 0.00001 || Math.abs(current.lng - lng) > 0.00001) {
        markerRef.current.setLatLng([lat, lng])
        map.panTo([lat, lng])
      }
    } else {
      markerRef.current = L.marker([lat, lng], { icon: markerIcon, draggable: true }).addTo(map)
      markerRef.current.on('dragend', async () => {
        const pos = markerRef.current?.getLatLng()
        if (!pos) return
        const label = await reverseGeocode(pos.lat, pos.lng)
        onChangeRef.current({
          latitude: Number(pos.lat.toFixed(6)),
          longitude: Number(pos.lng.toFixed(6)),
          address: label || undefined,
        })
      })
      map.setView([lat, lng], Math.max(map.getZoom(), 15))
    }
  }, [lat, lng])

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    setSearching(true)
    setHint(null)
    const found = await searchPlace(searchQuery.trim())
    setSearching(false)
    if (!found) {
      setHint('لم يتم العثور على الموقع. جرّب اسماً أدق أو انقر على الخريطة.')
      return
    }
    const map = mapRef.current
    if (map) {
      map.setView([found.lat, found.lng], 16)
      if (markerRef.current) {
        markerRef.current.setLatLng([found.lat, found.lng])
      } else {
        markerRef.current = L.marker([found.lat, found.lng], { icon: markerIcon, draggable: true }).addTo(map)
        markerRef.current.on('dragend', async () => {
          const pos = markerRef.current?.getLatLng()
          if (!pos) return
          const label = await reverseGeocode(pos.lat, pos.lng)
          onChangeRef.current({
            latitude: Number(pos.lat.toFixed(6)),
            longitude: Number(pos.lng.toFixed(6)),
            address: label || undefined,
          })
        })
      }
    }
    onChange({
      latitude: Number(found.lat.toFixed(6)),
      longitude: Number(found.lng.toFixed(6)),
      address: found.label,
    })
  }

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      setHint('المتصفح لا يدعم تحديد الموقع.')
      return
    }
    setLocating(true)
    setHint(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const nextLat = pos.coords.latitude
        const nextLng = pos.coords.longitude
        const map = mapRef.current
        if (map) {
          map.setView([nextLat, nextLng], 16)
          if (markerRef.current) markerRef.current.setLatLng([nextLat, nextLng])
          else {
            markerRef.current = L.marker([nextLat, nextLng], { icon: markerIcon, draggable: true }).addTo(map)
            markerRef.current.on('dragend', async () => {
              const p = markerRef.current?.getLatLng()
              if (!p) return
              const label = await reverseGeocode(p.lat, p.lng)
              onChangeRef.current({
                latitude: Number(p.lat.toFixed(6)),
                longitude: Number(p.lng.toFixed(6)),
                address: label || undefined,
              })
            })
          }
        }
        const label = await reverseGeocode(nextLat, nextLng)
        onChange({
          latitude: Number(nextLat.toFixed(6)),
          longitude: Number(nextLng.toFixed(6)),
          address: label || undefined,
        })
        setLocating(false)
      },
      () => {
        setLocating(false)
        setHint('تعذر الحصول على موقعك. اسمح بالوصول للموقع أو انقر على الخريطة.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const clearLocation = () => {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current)
      markerRef.current = null
    }
    onChange({ latitude: null, longitude: null })
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-sm font-medium">موقع المحل على الخريطة</p>
        <p className="text-xs text-[var(--text-muted)]">
          ابحث عن المكان أو انقر على الخريطة لوضع العلامة. يمكنك سحب العلامة لتعديل الموقع.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث عن مدينة أو شارع..."
            className="pr-10"
          />
        </div>
        <Button type="submit" variant="secondary" loading={searching}>
          بحث
        </Button>
        <Button type="button" variant="secondary" onClick={handleMyLocation} loading={locating}>
          <Navigation className="h-4 w-4" />
          موقعي
        </Button>
        {hasPoint && (
          <Button type="button" variant="ghost" onClick={clearLocation}>
            <Trash2 className="h-4 w-4" />
            إزالة
          </Button>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <div ref={containerRef} className="h-64 w-full sm:h-80" />
      </div>

      {hasPoint ? (
        <p className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--primary)]" />
          <span>
            تم تحديد الموقع
            {address ? ` — ${address}` : ''}
          </span>
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">لم يُحدد موقع بعد. انقر على الخريطة أو استخدم البحث.</p>
      )}
      {hint && <p className="text-xs text-[var(--danger)]">{hint}</p>}
    </div>
  )
}
