import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  FileText,
  Settings,
  Tags,
  ClipboardList,
  UserCog,
  Wrench,
  Wallet,
  Truck,
  PackagePlus,
  Receipt,
  Sparkles,
  Store,
  Smartphone,
  Banknote,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { canAccessRoute } from '../../lib/permissions'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import type { Role } from '../../types'
import { BrandLogo } from '../BrandLogo'

type NavItem = {
  to: string
  icon: LucideIcon
  label: string
  ownerOnly?: boolean
}

type NavSection = {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'الرئيسية',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم' },
      { to: '/smart-business', icon: Sparkles, label: 'مركز الأعمال الذكي' },
    ],
  },
  {
    title: 'المبيعات',
    items: [
      { to: '/pos', icon: ShoppingCart, label: 'نقطة البيع' },
      { to: '/sales', icon: FileText, label: 'الفواتير' },
      { to: '/customers', icon: Users, label: 'العملاء' },
    ],
  },
  {
    title: 'المخزون',
    items: [
      { to: '/products', icon: Package, label: 'المنتجات' },
      { to: '/categories', icon: Tags, label: 'التصنيفات' },
      { to: '/inventory', icon: ClipboardList, label: 'سجل المخزون' },
    ],
  },
  {
    title: 'المشتريات',
    items: [
      { to: '/purchase-intake', icon: PackagePlus, label: 'إدخال مشتريات' },
      { to: '/purchases', icon: Receipt, label: 'فواتير الشراء' },
      { to: '/suppliers', icon: Truck, label: 'الموردون' },
    ],
  },
  {
    title: 'العمليات',
    items: [
      { to: '/repairs', icon: Wrench, label: 'الصيانة' },
      { to: '/expenses', icon: Wallet, label: 'المصاريف' },
      { to: '/cashbox', icon: Banknote, label: 'صندوق العملات' },
    ],
  },
  {
    title: 'المعرض',
    items: [
      { to: '/catalog/settings', icon: Store, label: 'معرض المتجر', ownerOnly: true },
      { to: '/store-app', icon: Smartphone, label: 'تطبيق متجرك', ownerOnly: true },
    ],
  },
  {
    title: 'الإدارة',
    items: [
      { to: '/team', icon: UserCog, label: 'الفريق' },
      { to: '/settings', icon: Settings, label: 'الإعدادات' },
    ],
  },
]

function isItemVisible(item: NavItem, roleCode?: string, role?: Role | null) {
  if (item.ownerOnly) return roleCode === 'owner'
  return canAccessRoute(role, item.to)
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const store = useCurrentStore()
  const { stores, currentStoreId, setCurrentStore } = useAuthStore()
  const toast = useToastStore((s) => s.add)

  const handleStoreChange = (id: number) => {
    if (id === currentStoreId) return
    setCurrentStore(id)
    const name = stores.find((s) => s.id === id)?.name
    toast(name ? `تم التبديل إلى ${name}` : 'تم تبديل المتجر', 'success')
    onNavigate?.()
  }

  const sections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isItemVisible(item, store?.role?.code, store?.role)),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <aside className="flex h-full w-64 flex-col bg-[var(--sidebar)] text-[var(--sidebar-text)]">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <BrandLogo className="h-10 w-10 shrink-0 rounded-xl" />
        <div>
          <p className="font-bold text-white">موبي شوب</p>
          <p className="truncate text-xs opacity-70">{store?.name || '—'}</p>
        </div>
      </div>
      {stores.length > 1 && (
        <div className="border-b border-white/10 px-4 py-3">
          <label className="mb-1 block text-xs opacity-70">المتجر النشط</label>
          <select
            value={currentStoreId ?? ''}
            onChange={(e) => handleStoreChange(Number(e.target.value))}
            className="mobishop-select w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto p-3">
        {sections.map((section, index) => (
          <div key={section.title} className={cn(index > 0 && 'mt-4 border-t border-white/10 pt-4')}>
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wide text-white/45">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to !== '/smart-business'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-[var(--sidebar-active)] font-medium text-white'
                        : 'hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {store?.subscription?.status === 'trial' && (
        <div className="m-3 rounded-xl bg-amber-500/20 p-3 text-xs text-amber-200">
          فترة تجريبية — جرّب كل الميزات
        </div>
      )}
    </aside>
  )
}
