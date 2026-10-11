import { Menu, Moon, Sun, LogOut, Store } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'
import { useToastStore } from '../../stores/toastStore'
import { Button } from '../ui/Button'

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const navigate = useNavigate()
  const { user, stores, currentStoreId, setCurrentStore, logout } = useAuthStore()
  const { theme, toggle } = useThemeStore()
  const toast = useToastStore((s) => s.add)

  const handleStoreChange = (id: number) => {
    if (id === currentStoreId) return
    setCurrentStore(id)
    const storeName = stores.find((s) => s.id === id)?.name
    toast(storeName ? `تم التبديل إلى ${storeName}` : 'تم تبديل المتجر', 'success')
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-card)]/80 px-4 backdrop-blur-md lg:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <p className="hidden text-sm text-[var(--text-muted)] sm:block">
          مرحباً، {user?.first_name || user?.username}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {stores.length > 1 && (
          <div className="relative">
            <Store className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <select
              value={currentStoreId ?? ''}
              onChange={(e) => handleStoreChange(Number(e.target.value))}
              className="mobishop-select max-w-[140px] appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-muted)] py-2 pl-3 pr-9 text-sm sm:max-w-none"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={toggle} aria-label="تبديل الوضع">
          {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  )
}
