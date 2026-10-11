import { useCallback, useEffect, useRef, useState } from 'react'
import { ExternalLink, Store } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { LocationMapPicker } from '../../components/catalog/LocationMapPicker'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import type { MarketplaceAnalytics, StoreCatalogProfile } from '../../types'

export function CatalogSettingsPage() {
  const store = useCurrentStore()
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const toast = useToastStore((s) => s.add)
  const syncedRef = useRef(false)
  const [syncing, setSyncing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState<StoreCatalogProfile | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [analytics, setAnalytics] = useState<MarketplaceAnalytics | null>(null)

  const catalogEnabled = Boolean(store?.catalog_enabled)
  const isOwner = store?.role?.code === 'owner'
  const storeId = store?.id

  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    refreshStores()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [refreshStores])

  const loadProfile = useCallback(() => {
    setLoading(true)
    api
      .get<StoreCatalogProfile>('/stores/catalog/')
      .then(({ data }) => setProfile(data))
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    if (!catalogEnabled || !isOwner || !storeId) return
    loadProfile()
    api
      .get<MarketplaceAnalytics>('/stores/marketplace-analytics/')
      .then(({ data }) => setAnalytics(data))
      .catch(() => setAnalytics(null))
  }, [catalogEnabled, isOwner, storeId, loadProfile])

  if (syncing) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  if (!catalogEnabled) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Store className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
        <h1 className="text-xl font-bold">معرض المتجر غير مفعّل</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          هذه الميزة تُفعَّل من إدارة المنصة (Super Admin) لكل متجر على حدة.
        </p>
        {store && (
          <p className="mt-3 rounded-xl bg-[var(--bg-muted)] px-4 py-3 text-sm">
            المتجر الحالي: <strong>{store.name}</strong>
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              تأكد من تفعيل «Catalog enabled» لهذا المتجر في  Admin ثم اضغط «حفظ».
            </span>
          </p>
        )}
        <Button type="button" className="mt-6" variant="secondary" onClick={() => refreshStores()}>
          تحديث الحالة
        </Button>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <p className="py-16 text-center text-[var(--text-muted)]">
        إعدادات المعرض متاحة لمالك المتجر فقط.
      </p>
    )
  }

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData()
    fd.append('is_public', String(profile.is_public))
    if (profile.slug) fd.append('slug', profile.slug)
    fd.append('description', profile.description)
    fd.append('contact_phone', profile.contact_phone)
    fd.append('whatsapp', profile.whatsapp)
    fd.append('telegram', profile.telegram)
    fd.append('address', profile.address || '')
    fd.append('latitude', profile.latitude === null || profile.latitude === '' ? '' : String(profile.latitude))
    fd.append('longitude', profile.longitude === null || profile.longitude === '' ? '' : String(profile.longitude))
    fd.append('show_prices', String(profile.show_prices))
    fd.append('show_out_of_stock', String(profile.show_out_of_stock))
    if (logoFile) fd.append('catalog_logo', logoFile)
    if (bannerFile) fd.append('banner', bannerFile)

    try {
      const { data } = await api.patch<StoreCatalogProfile>('/stores/catalog/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setProfile(data)
      setLogoFile(null)
      setBannerFile(null)
      toast('تم حفظ إعدادات المعرض', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">معرض المتجر</h1>
          <p className="text-sm text-[var(--text-muted)]">إعدادات المعرض العام لمتجرك</p>
        </div>
        {profile.is_public && profile.slug && (
          <Link
            to={`/shop/${profile.slug}`}
            target="_blank"
            className="flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            معاينة المعرض
          </Link>
        )}
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-4">
            <input
              type="checkbox"
              checked={profile.is_public}
              onChange={(e) => setProfile({ ...profile, is_public: e.target.checked })}
              className="h-4 w-4"
            />
            <div>
              <p className="font-medium">تفعيل المعرض العام</p>
              <p className="text-xs text-[var(--text-muted)]">يجعل المعرض متاحاً للزوار عبر الرابط العام</p>
            </div>
          </label>

          <Input
            label="معرّف المتجر (Slug)"
            value={profile.slug || ''}
            onChange={(e) => setProfile({ ...profile, slug: e.target.value })}
            placeholder="my-store"
          />

          <div>
            <label className="mb-1.5 block text-sm font-medium">شعار الكتالوج</label>
            {profile.catalog_logo_url && !logoFile && (
              <img src={profile.catalog_logo_url} alt="" className="mb-2 h-16 rounded-lg object-contain" />
            )}
            <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">بانر الكتالوج</label>
            {profile.banner_url && !bannerFile && (
              <img src={profile.banner_url} alt="" className="mb-2 h-24 w-full rounded-lg object-cover" />
            )}
            <input type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} />
          </div>

          <Input
            label="وصف المتجر"
            value={profile.description}
            onChange={(e) => setProfile({ ...profile, description: e.target.value })}
          />
          <Input
            label="هاتف التواصل"
            value={profile.contact_phone}
            onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })}
          />
          <Input
            label="واتساب"
            value={profile.whatsapp}
            onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })}
          />
          <Input
            label="Telegram"
            value={profile.telegram}
            onChange={(e) => setProfile({ ...profile, telegram: e.target.value })}
            placeholder="@username"
          />
          <Input
            label="عنوان المحل"
            value={profile.address || ''}
            onChange={(e) => setProfile({ ...profile, address: e.target.value })}
            placeholder="يُملأ تلقائياً عند اختيار الموقع على الخريطة"
          />
          <LocationMapPicker
            latitude={profile.latitude}
            longitude={profile.longitude}
            address={profile.address || ''}
            onChange={({ latitude, longitude, address }) =>
              setProfile((prev) =>
                prev
                  ? {
                      ...prev,
                      latitude,
                      longitude,
                      address: address !== undefined ? address : prev.address,
                    }
                  : prev,
              )
            }
          />

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={profile.show_prices}
              onChange={(e) => setProfile({ ...profile, show_prices: e.target.checked })}
            />
            <span className="text-sm">عرض الأسعار</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={profile.show_out_of_stock}
              onChange={(e) => setProfile({ ...profile, show_out_of_stock: e.target.checked })}
            />
            <span className="text-sm">عرض المنتجات غير المتوفرة</span>
          </label>

          <Button type="submit" loading={saving}>حفظ الإعدادات</Button>
        </form>
      </Card>

      {analytics && (
        <Card>
          <h2 className="mb-4 text-lg font-bold">إحصائيات السوق العام</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-[var(--bg-muted)] p-4">
              <p className="text-sm text-[var(--text-muted)]">مشاهدات المتجر</p>
              <p className="text-2xl font-bold">{analytics.store_views}</p>
            </div>
            <div className="rounded-xl bg-[var(--bg-muted)] p-4">
              <p className="text-sm text-[var(--text-muted)]">مشاهدات المنتجات</p>
              <p className="text-2xl font-bold">{analytics.product_views}</p>
            </div>
          </div>
          {analytics.top_products.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium">المنتجات الأكثر مشاهدة</p>
              <ul className="space-y-2 text-sm">
                {analytics.top_products.map((p) => (
                  <li key={p.id} className="flex justify-between border-b border-[var(--border)]/50 py-2">
                    <span>{p.name}</span>
                    <span className="text-[var(--text-muted)]">{p.views} مشاهدة</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
