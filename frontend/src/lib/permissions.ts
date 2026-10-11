import type { Role } from '../types'

export const PERMISSION_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم',
  pos: 'نقطة البيع',
  sales: 'عرض الفواتير',
  sales_cancel: 'إلغاء الفواتير',
  sales_return: 'مرتجع جزئي',
  products: 'إدارة المنتجات',
  products_read: 'عرض المنتجات',
  categories: 'التصنيفات',
  inventory: 'سجل المخزون',
  customers: 'إدارة العملاء',
  customers_read: 'عرض العملاء',
  suppliers: 'إدارة الموردين',
  suppliers_read: 'عرض الموردين',
  purchases: 'إدخال مشتريات',
  purchases_read: 'عرض فواتير الشراء',
  purchases_cancel: 'إلغاء فواتير الشراء',
  expenses: 'إدارة المصاريف',
  expenses_read: 'عرض المصاريف',
  repairs: 'الصيانة',
  settings: 'الإعدادات',
  team: 'فريق العمل',
  decision_center: 'مركز القرارات',
  profit_intelligence: 'تحليل الأرباح',
  ai_assistant: 'المساعد الذكي',
}

export const ROUTE_PERMISSIONS: Record<string, string[]> = {
  '/dashboard': ['dashboard'],
  '/pos': ['pos'],
  '/products': ['products', 'products_read'],
  '/categories': ['categories'],
  '/inventory': ['inventory'],
  '/sales': ['sales', 'pos'],
  '/repairs': ['repairs'],
  '/expenses': ['expenses', 'expenses_read'],
  '/cashbox': ['dashboard', 'sales', 'settings'],
  '/customers': ['customers', 'customers_read'],
  '/suppliers': ['suppliers', 'suppliers_read'],
  '/purchase-intake': ['purchases'],
  '/purchases': ['purchases', 'purchases_read'],
  '/team': ['team'],
  '/settings': ['settings'],
  '/smart-business': ['decision_center', 'profit_intelligence', 'ai_assistant'],
  '/smart-business/decision-center': ['decision_center'],
  '/smart-business/profit-intelligence': ['profit_intelligence'],
  '/smart-business/assistant': ['ai_assistant'],
}

export function hasPermission(role: Role | null | undefined, ...perms: string[]): boolean {
  const list = role?.permissions ?? []
  if (list.includes('*')) return true
  return perms.some((p) => list.includes(p))
}

export function canAccessRoute(role: Role | null | undefined, path: string): boolean {
  const required = ROUTE_PERMISSIONS[path]
  if (required) {
    const list = role?.permissions ?? []
    if (list.includes('*')) return true
    return required.some((p) => list.includes(p))
  }
  if (path.startsWith('/smart-business')) {
    return canAccessRoute(role, '/smart-business')
  }
  return true
}
