import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, RefreshCw, Smartphone } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import type { StoreAppBuild, StoreAppStatus } from '../../types'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800',
  building: 'bg-sky-50 text-sky-800',
  completed: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-red-50 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
}

export function StoreAppPage() {
  const store = useCurrentStore()
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const toast = useToastStore((s) => s.add)
  const syncedRef = useRef(false)
  const [syncing, setSyncing] = useState(true)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState<StoreAppStatus | null>(null)
  const [builds, setBuilds] = useState<StoreAppBuild[]>([])
  const [appName, setAppName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#0F766E')
  const [iconFile, setIconFile] = useState<File | null>(null)

  const featureEnabled = Boolean(store?.store_app_enabled)
  const isOwner = store?.role?.code === 'owner'
  const storeId = store?.id

  useEffect(() => {
    if (syncedRef.current) return
    syncedRef.current = true
    refreshStores()
      .catch(() => {})
      .finally(() => setSyncing(false))
  }, [refreshStores])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: st }, { data: list }] = await Promise.all([
        api.get<StoreAppStatus>('/store-app/status/'),
        api.get<StoreAppBuild[] | { results: StoreAppBuild[] }>('/store-app/builds/'),
      ])
      setStatus(st)
      setAppName((prev) => prev || st.default_app_name || '')
      setPrimaryColor(st.default_color || '#0F766E')
      const rows = Array.isArray(list) ? list : list.results || []
      setBuilds(rows)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!featureEnabled || !isOwner || !storeId) return
    load()
  }, [featureEnabled, isOwner, storeId, load])

  // Poll while a build is in progress
  useEffect(() => {
    const busy = builds.some((b) => b.status === 'pending' || b.status === 'building')
    if (!busy) return
    const t = window.setInterval(() => {
      load().catch(() => {})
    }, 2500)
    return () => window.clearInterval(t)
  }, [builds, load])

  const onGenerate = async () => {
    if (!status?.can_generate) {
      toast(status?.message || 'لا يمكن إنشاء التطبيق حالياً', 'error')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('app_name', appName.trim())
      fd.append('primary_color', primaryColor)
      if (iconFile) fd.append('app_icon', iconFile)
      await api.post('/store-app/builds/', fd)
      toast('بدأ إنشاء التطبيق', 'success')
      setIconFile(null)
      await load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const onRetry = async (id: number) => {
    try {
      await api.post(`/store-app/builds/${id}/retry/`)
      toast('تمت إعادة المحاولة', 'success')
      await load()
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  const onDownload = async (build: StoreAppBuild) => {
    try {
      const res = await api.get(`/store-app/builds/${build.id}/download/`, {
        responseType: 'blob',
      })
      const blob = new Blob([res.data], { type: 'application/vnd.android.package-archive' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${build.app_name}-v${build.version_name}.apk`.replace(/\s+/g, '_')
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    }
  }

  if (syncing) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  if (!featureEnabled) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <Smartphone className="mx-auto mb-4 h-12 w-12 text-[var(--text-muted)]" />
        <h1 className="text-xl font-bold">تطبيق متجرك</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          ميزة تطبيق المتجر غير متاحة ضمن اشتراكك الحالي.
        </p>
        {store && (
          <p className="mt-3 rounded-xl bg-[var(--bg-muted)] px-4 py-3 text-sm">
            المتجر الحالي: <strong>{store.name}</strong>
            <span className="mt-1 block text-xs text-[var(--text-muted)]">
              تأكد من تفعيل «Store app enabled» لهذا المتجر في لوحة الإدارة ثم اضغط تحديث.
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
        إنشاء تطبيق المتجر متاح لمالك المتجر فقط.
      </p>
    )
  }

  if (loading && !status) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">تطبيق متجرك</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          حوّل متجرك الإلكتروني إلى تطبيق Android خاص بمتجرك.
        </p>
      </div>

      {!status?.can_generate && status?.message && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {status.message}
        </div>
      )}

      <Card className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium">اسم التطبيق</label>
          <Input
            value={appName}
            onChange={(e) => setAppName(e.target.value)}
            maxLength={50}
            placeholder="اسم يظهر على هاتف العميل"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            الاسم الظاهر فقط. أندرويد يتعرّف على التطبيق بمعرّف ثابت للمتجر
            {status?.latest_build?.package_name
              ? ` (${status.latest_build.package_name})`
              : ''}
            ، فتغيير الاسم وإعادة البناء يُثبَّت كتحديث وليس كتطبيق جديد.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">رابط المتجر</label>
          <Input value={status?.store_url || '—'} readOnly disabled />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            يُحدَّد تلقائياً من معرض متجرك ولا يمكن تغييره.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">أيقونة التطبيق</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm"
            onChange={(e) => setIconFile(e.target.files?.[0] || null)}
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            PNG مربع مفضّل (512×512 أو أعلى). إن لم ترفع أيقونة تُستخدم شعار المعرض.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">لون التطبيق</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-[var(--border)] bg-transparent"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              maxLength={7}
              className="max-w-[140px]"
            />
          </div>
        </div>
        <Button type="button" onClick={onGenerate} disabled={submitting || !status?.can_generate}>
          {submitting ? 'جارٍ الإنشاء...' : 'إنشاء التطبيق'}
        </Button>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">آخر التطبيقات التي تم إنشاؤها</h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {builds.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">لا توجد تطبيقات بعد.</p>
        ) : (
          <div className="space-y-3">
            {builds.map((b) => (
              <Card key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{b.app_name}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    الإصدار {b.version_name} · {new Date(b.created_at).toLocaleDateString('ar')}
                    {b.package_name ? ` · ${b.package_name}` : ''}
                  </p>
                  <span
                    className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs ${STATUS_CLASS[b.status] || ''}`}
                  >
                    {b.status_label || b.status}
                  </span>
                  {b.status === 'failed' && b.error_message && (
                    <p className="mt-2 text-xs text-red-600">{b.error_message}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {b.status === 'completed' && b.is_installable === false && (
                    <p className="mt-2 text-xs text-amber-700">
                      هذا الملف تجريبي ولا يُثبَّت على Android. أنشئ تطبيقاً جديداً بعد تفعيل بناء APK الحقيقي.
                    </p>
                  )}
                  {b.status === 'completed' && (
                    <Button type="button" size="sm" onClick={() => onDownload(b)} disabled={b.is_installable === false}>
                      <Download className="h-4 w-4" />
                      تحميل APK
                    </Button>
                  )}
                  {(b.status === 'failed' || b.status === 'cancelled') && (
                    <Button type="button" size="sm" variant="secondary" onClick={() => onRetry(b.id)}>
                      إعادة المحاولة
                    </Button>
                  )}
                  {b.status === 'completed' && (
                    <Button type="button" size="sm" variant="secondary" onClick={onGenerate}>
                      إعادة إنشاء
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
