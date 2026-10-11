import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { BrandLogo } from '../../components/BrandLogo'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { useToastStore } from '../../stores/toastStore'
import type { Store, User } from '../../types'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromMarketplace = searchParams.get('from') === 'marketplace'
  const setAuth = useAuthStore((s) => s.setAuth)
  const setStores = useAuthStore((s) => s.setStores)
  const { theme, toggle } = useThemeStore()
  const toast = useToastStore((s) => s.add)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ username: '', password: '' })
  const [formError, setFormError] = useState('')

  const loadStores = async () => {
    const { data } = await api.get<Store[] | { results: Store[] }>('/stores/')
    const list = Array.isArray(data) ? data : data.results ?? []
    setStores(list)
    if (list.length === 0) {
      navigate('/create-store')
    } else {
      navigate('/dashboard')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')
    setLoading(true)
    try {
      const { data: tokens } = await api.post('/auth/login/', form)
      const access = tokens.access
      const refresh = tokens.refresh
      api.defaults.headers.Authorization = `Bearer ${access}`
      const { data: user } = await api.get<User>('/auth/me/', {
        headers: { Authorization: `Bearer ${access}` },
      })
      setAuth(user, access, refresh)
      await loadStores()
      toast('تم تسجيل الدخول بنجاح', 'success')
    } catch (err) {
      const msg = getErrorMessage(err)
      setFormError(msg)
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-800 to-brand-950 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-10 w-10 rounded-xl" />
          <span className="text-2xl font-bold">موبي شوب</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">إدارة محل الموبايلات باحترافية</h1>
          <p className="mt-4 text-lg text-blue-100">
            منتجات، مخزون، فواتير، نقطة بيع، ولوحة تحكم — كل شيء في مكان واحد.
          </p>
        </div>
        <p className="text-sm text-blue-200">© 2026 موبي شوب</p>
      </div>
      <div className="relative flex flex-1 items-center justify-center p-6">
        <button
          onClick={toggle}
          className="absolute left-6 top-6 rounded-xl p-2 hover:bg-[var(--bg-muted)]"
        >
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>
        <Card className="w-full max-w-md">
          <h2 className="mb-6 text-2xl font-bold">{fromMarketplace ? 'دخول التجار' : 'تسجيل الدخول'}</h2>
          {fromMarketplace && (
            <p className="-mt-4 mb-6 text-sm text-[var(--text-muted)]">
              للتجار الحاليين فقط — أدخل بيانات حسابك لإدارة متجرك.
            </p>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            {formError && (
              <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {formError}
              </p>
            )}
            <Input
              label="اسم المستخدم"
              name="username"
              value={form.username}
              onChange={(e) => {
                setFormError('')
                setForm({ ...form, username: e.target.value })
              }}
              required
              autoComplete="username"
            />
            <Input
              label="كلمة المرور"
              name="password"
              type="password"
              value={form.password}
              onChange={(e) => {
                setFormError('')
                setForm({ ...form, password: e.target.value })
              }}
              required
              autoComplete="current-password"
            />
            <Button type="submit" className="w-full" loading={loading}>
              دخول
            </Button>
          </form>
          {fromMarketplace ? (
            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              <Link to="/marketplace" className="font-medium text-[var(--primary)] hover:underline">
                العودة للسوق
              </Link>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
              ليس لديك حساب؟{' '}
              <Link to="/register" className="font-medium text-[var(--primary)] hover:underline">
                إنشاء حساب
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
