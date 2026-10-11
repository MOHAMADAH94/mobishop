import { Link, NavLink } from 'react-router-dom'
import { Store, ShoppingBag, Tag, Sparkles } from 'lucide-react'
import { useAuthStore } from '../../stores/authStore'

export function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const merchantHref = accessToken ? '/dashboard' : '/login?from=marketplace'
  const merchantLabel = accessToken ? 'لوحة التحكم' : 'دخول التجار'
  return (
    <div className="min-h-screen bg-[var(--bg)]" dir="rtl">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-card)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/marketplace" className="flex items-center gap-2 font-bold text-[var(--primary)]">
            <Sparkles className="h-6 w-6" />
            <span>سوق موبي شوب</span>
          </Link>
          <nav className="flex items-center gap-1 overflow-x-auto">
            <MarketNav to="/marketplace" end icon={Sparkles} label="الرئيسية" />
            <MarketNav to="/marketplace/stores" icon={Store} label="المتاجر" />
            <MarketNav to="/marketplace/products" icon={ShoppingBag} label="المنتجات" />
            <MarketNav to="/marketplace/offers" icon={Tag} label="العروض" />
          </nav>
          <Link
            to={merchantHref}
            className="shrink-0 text-sm text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            {merchantLabel}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--text-muted)]">
        سوق موبي شوب — اكتشف المتاجر والمنتجات
      </footer>
    </div>
  )
}

function MarketNav({
  to,
  end,
  icon: Icon,
  label,
}: {
  to: string
  end?: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isActive ? 'bg-[var(--primary)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-muted)]'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  )
}
