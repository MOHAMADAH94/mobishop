import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { CurrencySelect } from '../../components/ui/CurrencySelect'
import { Card } from '../../components/ui/Card'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'
import { extractList } from '../../lib/apiHelpers'
import { DEFAULT_CURRENCY } from '../../lib/currencies'
import type { Store } from '../../types'

export function CreateStorePage() {
  const navigate = useNavigate()
  const stores = useAuthStore((s) => s.stores)
  const setStores = useAuthStore((s) => s.setStores)
  const setCurrentStore = useAuthStore((s) => s.setCurrentStore)
  const toast = useToastStore((s) => s.add)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    name: '',
    business_type: 'mobile',
    currency: DEFAULT_CURRENCY,
    phone: '',
    address: '',
  })

  useEffect(() => {
    let cancelled = false
    api
      .get<Store[] | { results: Store[] }>('/stores/')
      .then(({ data }) => {
        if (cancelled) return
        const list = extractList(data)
        setStores(list)
        if (list.length > 0) {
          navigate('/dashboard', { replace: true })
          return
        }
        setChecking(false)
      })
      .catch(() => {
        if (cancelled) return
        if (stores.length > 0) {
          navigate('/dashboard', { replace: true })
          return
        }
        setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [navigate, setStores, stores.length])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post<Store>('/stores/create/', form)
      const { data: storesData } = await api.get<Store[] | { results: Store[] }>('/stores/')
      const nextStores = extractList(storesData)
      setStores(nextStores)
      setCurrentStore(data.id)
      toast('تم إنشاء المتجر', 'success')
      navigate('/dashboard')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <h2 className="mb-2 text-2xl font-bold">إنشاء متجرك</h2>
        <p className="mb-6 text-sm text-[var(--text-muted)]">
          ابدأ بإعداد متجرك للعمل على النظام. يمكنك إنشاء متجر واحد فقط من هنا؛ أي فرع إضافي يُضاف عبر الإدارة.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="اسم المتجر"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium">نوع النشاط</label>
            <select
              value={form.business_type}
              onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
            >
              <option value="mobile">محلات موبايلات</option>
              <option value="accessories">إكسسوارات</option>
              <option value="mixed">مختلط</option>
            </select>
          </div>
          <CurrencySelect
            value={form.currency}
            onChange={(currency) => setForm({ ...form, currency })}
            required
          />
          <Input
            label="هاتف المتجر"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="العنوان"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <Button type="submit" className="w-full" loading={loading}>
            إنشاء المتجر
          </Button>
        </form>
      </Card>
    </div>
  )
}
