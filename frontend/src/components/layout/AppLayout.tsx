import { lazy, Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { StoreBanner } from './StoreBanner'
import { OfflineBanner } from './OfflineBanner'
import { useAuthStore } from '../../stores/authStore'
import { cn } from '../../lib/utils'

const AssistantFab = lazy(() =>
  import('../assistant/AssistantFab').then((m) => ({ default: m.AssistantFab })),
)

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const storeVersion = useAuthStore((s) => s.storeVersion ?? 0)

  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  const mobileSidebar =
    sidebarOpen &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
        <div className="fixed inset-y-0 right-0 z-50 w-64 max-w-[85vw] lg:hidden">
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </div>
      </>,
      document.body,
    )

  return (
    <div className="flex min-h-screen min-w-0 overflow-x-hidden">
      <div className="hidden shrink-0 lg:block">
        <Sidebar />
      </div>
      {mobileSidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className={cn('min-w-0 flex-1 p-4 lg:p-6')}>
          <StoreBanner />
          <OfflineBanner />
          <Outlet key={storeVersion} />
        </main>
      </div>
      <Suspense fallback={null}>
        <AssistantFab />
      </Suspense>
    </div>
  )
}
