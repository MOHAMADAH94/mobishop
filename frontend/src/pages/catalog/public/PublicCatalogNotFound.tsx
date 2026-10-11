import { Link } from 'react-router-dom'

export function PublicCatalogNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 text-center" dir="rtl">
      <p className="text-6xl font-bold text-[var(--text-muted)]">404</p>
      <h1 className="mt-4 text-xl font-bold">المعرض غير متاح</h1>
      <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
        هذا المتجر لا يملك معرضاً عاماً أو أن الرابط غير صحيح.
      </p>
      <Link to="/login" className="mt-6 text-sm text-[var(--primary)] hover:underline">
        تسجيل الدخول إلى موبي شوب
      </Link>
    </div>
  )
}
