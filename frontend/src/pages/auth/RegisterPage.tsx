import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getErrorMessage, getFieldErrors } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { useAuthStore } from '../../stores/authStore'
import { useToastStore } from '../../stores/toastStore'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const toast = useToastStore((s) => s.add)
  const [loading, setLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    password_confirm: '',
    first_name: '',
    last_name: '',
    phone: '',
  })

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (fieldErrors[key]) {
      setFieldErrors((e) => {
        const next = { ...e }
        delete next[key]
        return next
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({})

    if (form.password !== form.password_confirm) {
      const msg = 'كلمات المرور غير متطابقة.'
      setFieldErrors({ password_confirm: msg })
      toast(msg, 'error')
      return
    }

    setLoading(true)
    try {
      const { data } = await api.post('/auth/register/', form)
      setAuth(data.user, data.tokens.access, data.tokens.refresh)
      toast('تم إنشاء الحساب', 'success')
      navigate('/create-store')
    } catch (err) {
      const fields = getFieldErrors(err)
      setFieldErrors(fields)
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <h2 className="mb-6 text-2xl font-bold">إنشاء حساب جديد</h2>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="الاسم الأول"
            value={form.first_name}
            onChange={(e) => update('first_name', e.target.value)}
            error={fieldErrors.first_name}
            className="sm:col-span-1"
          />
          <Input
            label="اسم العائلة"
            value={form.last_name}
            onChange={(e) => update('last_name', e.target.value)}
            error={fieldErrors.last_name}
          />
          <Input
            label="اسم المستخدم"
            value={form.username}
            onChange={(e) => update('username', e.target.value)}
            required
            error={fieldErrors.username}
            className="sm:col-span-2"
            autoComplete="username"
          />
          <Input
            label="البريد الإلكتروني"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            required
            error={fieldErrors.email}
            className="sm:col-span-2"
            autoComplete="email"
          />
          <Input
            label="الجوال"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            error={fieldErrors.phone}
            className="sm:col-span-2"
          />
          <Input
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
            error={fieldErrors.password}
            autoComplete="new-password"
          />
          <Input
            label="تأكيد كلمة المرور"
            type="password"
            value={form.password_confirm}
            onChange={(e) => update('password_confirm', e.target.value)}
            required
            error={fieldErrors.password_confirm}
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full sm:col-span-2" loading={loading}>
            تسجيل
          </Button>
        </form>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-[var(--primary)] hover:underline">
            لديك حساب؟ سجّل دخول
          </Link>
        </p>
      </Card>
    </div>
  )
}
