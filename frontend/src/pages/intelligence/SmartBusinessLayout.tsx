import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { Lightbulb, TrendingUp, Bot, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'
import { hasPermission } from '../../lib/permissions'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'

const tabs: {
  to: string
  permission: string
  icon: typeof Bot
  label: string
  requiresAiFlag?: boolean
}[] = [
  {
    to: '/smart-business/decision-center',
    permission: 'decision_center',
    icon: Lightbulb,
    label: 'مركز القرارات',
  },
  {
    to: '/smart-business/profit-intelligence',
    permission: 'profit_intelligence',
    icon: TrendingUp,
    label: 'تحليل الأرباح',
  },
  {
    to: '/smart-business/assistant',
    permission: 'ai_assistant',
    icon: Bot,
    label: 'مساعد موبي شوب الذكي',
    requiresAiFlag: true,
  },
]

export function SmartBusinessLayout() {
  const role = useAuthStore((s) => s.currentStore()?.role)
  const store = useCurrentStore()
  const visibleTabs = tabs.filter((t) => {
    if (!hasPermission(role, t.permission)) return false
    if (t.requiresAiFlag && store?.ai_assistant_enabled === false) return false
    return true
  })

  if (visibleTabs.length === 0) {
    return (
      <p className="py-12 text-center text-[var(--text-muted)]">
        لا تملك صلاحية الوصول لمركز الأعمال الذكي
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Sparkles className="h-7 w-7 text-[var(--primary)]" />
          مركز الأعمال الذكي
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          أدوات الذكاء التجاري لاتخاذ قرارات أفضل وتحسين أرباح متجرك
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-1">
        {visibleTabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-b-2 border-[var(--primary)] text-[var(--primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

export function SmartBusinessIndexRedirect() {
  const role = useAuthStore((s) => s.currentStore()?.role)
  const store = useCurrentStore()
  const first = tabs.find((t) => {
    if (!hasPermission(role, t.permission)) return false
    if (t.requiresAiFlag && store?.ai_assistant_enabled === false) return false
    return true
  })
  if (!first) {
    return (
      <p className="py-12 text-center text-[var(--text-muted)]">
        لا تملك صلاحية الوصول لمركز الأعمال الذكي
      </p>
    )
  }
  return <Navigate to={first.to} replace />
}
