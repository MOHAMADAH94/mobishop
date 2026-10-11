import { AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui/Button'

export function StoreBanner() {
  const stores = useAuthStore((s) => s.stores)
  const currentStoreId = useAuthStore((s) => s.currentStoreId)

  if (currentStoreId) return null

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
      <div className="flex-1">
        {stores.length === 0
          ? 'لم يتم ربط متجر بحسابك. أنشئ متجرك الأول للمتابعة، أو تواصل مع الإدارة إن كان لديك متجر مسبقاً.'
          : 'اختر متجراً من القائمة أعلاه أو أعد تحميل الصفحة.'}
      </div>
      {stores.length === 0 && (
        <Link to="/create-store">
          <Button size="sm">إنشاء متجري</Button>
        </Link>
      )}
    </div>
  )
}
