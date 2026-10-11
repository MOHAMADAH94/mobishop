import { useEffect, useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { downloadBlobSafe } from '../../lib/downloadBlob'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { CurrencySelect } from '../../components/ui/CurrencySelect'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { useToastStore } from '../../stores/toastStore'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { resolveCurrency, DEFAULT_CURRENCY } from '../../lib/currencies'
import { StoreCurrenciesPanel } from '../../components/settings/StoreCurrenciesPanel'
import type { Store, StoreSettings } from '../../types'

export function SettingsPage() {
  const toast = useToastStore((s) => s.add)
  const setStores = useAuthStore((s) => s.setStores)
  const store = useCurrentStore()
  const storeVersion = useStoreVersion()
  const [storeForm, setStoreForm] = useState({ name: '', phone: '', address: '', currency: DEFAULT_CURRENCY })
  const [settings, setSettings] = useState({
    tax_rate: '15',
    low_stock_threshold: '5',
    invoice_footer: '',
    invoice_prefix: 'INV',
  })
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const isOwner = store?.role?.code === 'owner'

  useEffect(() => {
    api.get<Store>('/stores/current/').then(({ data }) => {
      setStoreForm({
        name: data.name,
        phone: data.phone,
        address: data.address || '',
        currency: resolveCurrency(data.currency),
      })
      if (data.settings) {
        const s = data.settings as StoreSettings
        setSettings({
          tax_rate: s.tax_rate,
          low_stock_threshold: String(s.low_stock_threshold),
          invoice_footer: s.invoice_footer,
          invoice_prefix: s.invoice_prefix,
        })
      }
    })
  }, [store?.id, storeVersion])

  const exportExcel = async () => {
    if (!store) return
    setExporting(true)
    const safeName = store.name.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 40)
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    let failed = false
    await downloadBlobSafe(
      '/stores/export/excel/',
      `mobishop_${safeName}_${stamp}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      (msg) => {
        failed = true
        toast(msg, 'error')
      },
    )
    setExporting(false)
    if (!failed) toast('تم تصدير البيانات', 'success')
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.patch('/stores/current/', storeForm)
      await api.patch('/stores/settings/', {
        ...settings,
        tax_rate: settings.tax_rate,
        low_stock_threshold: parseInt(settings.low_stock_threshold, 10),
      })
      const { data: storesData } = await api.get<Store[] | { results: Store[] }>('/stores/')
      setStores(Array.isArray(storesData) ? storesData : storesData.results)
      toast('تم حفظ الإعدادات', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">إعدادات المتجر</h1>
      <form onSubmit={save} className="space-y-6">
        <Card>
          <CardHeader><CardTitle>معلومات المتجر</CardTitle></CardHeader>
          <div className="grid gap-4">
            <Input label="اسم المتجر" value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} />
            <Input label="الهاتف" value={storeForm.phone} onChange={(e) => setStoreForm({ ...storeForm, phone: e.target.value })} />
            <Input label="العنوان" value={storeForm.address} onChange={(e) => setStoreForm({ ...storeForm, address: e.target.value })} />
            <CurrencySelect
              label="العملة الأساسية"
              value={storeForm.currency}
              onChange={(currency) => setStoreForm({ ...storeForm, currency })}
            />
          </div>
        </Card>
        <Card>
          <CardHeader><CardTitle>الفواتير والضريبة</CardTitle></CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="نسبة الضريبة %" type="number" value={settings.tax_rate} onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })} />
            <Input label="حد تنبيه المخزون" type="number" value={settings.low_stock_threshold} onChange={(e) => setSettings({ ...settings, low_stock_threshold: e.target.value })} />
            <Input label="بادئة الفاتورة" value={settings.invoice_prefix} onChange={(e) => setSettings({ ...settings, invoice_prefix: e.target.value })} />
            <Input label="تذييل الفاتورة" value={settings.invoice_footer} onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })} className="sm:col-span-2" />
          </div>
        </Card>
        <Button type="submit" loading={loading}>حفظ التغييرات</Button>
      </form>

      {isOwner && <StoreCurrenciesPanel />}

      {isOwner && (
        <Card>
          <CardHeader><CardTitle>تصدير البيانات</CardTitle></CardHeader>
          <p className="mb-4 text-sm text-[var(--text-muted)]">
            تنزيل نسخة Excel تشمل: المنتجات، العملاء، الفواتير، المصاريف، الصيانة، والفريق.
          </p>
          <Button
            type="button"
            variant="secondary"
            loading={exporting}
            onClick={exportExcel}
          >
            <FileSpreadsheet className="h-4 w-4" />
            تصدير إلى Excel
          </Button>
        </Card>
      )}
    </div>
  )
}
