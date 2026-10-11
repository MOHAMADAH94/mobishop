"""صلاحيات الأدوار — تعريفات ومساعدات التحقق."""

from stores.models import Role, StoreRolePermission

# كل الصلاحيات المتاحة (المفتاح → التسمية العربية)
PERMISSION_LABELS = {
    'dashboard': 'لوحة التحكم',
    'pos': 'نقطة البيع',
    'sales': 'عرض الفواتير',
    'sales_cancel': 'إلغاء الفواتير',
    'sales_return': 'مرتجع جزئي',
    'products': 'إدارة المنتجات',
    'products_read': 'عرض المنتجات',
    'categories': 'التصنيفات',
    'inventory': 'سجل المخزون',
    'customers': 'إدارة العملاء',
    'customers_read': 'عرض العملاء',
    'suppliers': 'إدارة الموردين',
    'suppliers_read': 'عرض الموردين',
    'purchases': 'إدخال مشتريات',
    'purchases_read': 'عرض فواتير الشراء',
    'purchases_cancel': 'إلغاء فواتير الشراء',
    'expenses': 'إدارة المصاريف',
    'expenses_read': 'عرض المصاريف',
    'repairs': 'الصيانة',
    'settings': 'الإعدادات',
    'team': 'فريق العمل',
    'decision_center': 'مركز القرارات',
    'profit_intelligence': 'تحليل الأرباح',
    'ai_assistant': 'المساعد الذكي',
}

DEFAULT_ROLE_PERMISSIONS = {
    Role.Code.OWNER: ['*'],
    Role.Code.MANAGER: [
        'dashboard', 'pos', 'sales', 'sales_cancel', 'sales_return',
        'products', 'categories', 'inventory', 'customers', 'suppliers', 'purchases',
        'purchases_read', 'purchases_cancel', 'expenses',
        'repairs', 'settings',
        'decision_center', 'profit_intelligence', 'ai_assistant',
    ],
    Role.Code.CASHIER: [
        'dashboard', 'pos', 'sales', 'sales_return',
        'customers_read', 'products_read',
    ],
    Role.Code.TECHNICIAN: [
        'dashboard', 'repairs', 'customers_read', 'products_read',
    ],
}

CONFIGURABLE_ROLES = (Role.Code.MANAGER, Role.Code.CASHIER, Role.Code.TECHNICIAN)

# صلاحيات قديمة → المفتاح الحالي
LEGACY_PERMISSION_ALIASES = {
    'reports': 'dashboard',
}


def normalize_permissions(permissions):
    """تحويل الصلاحيات القديمة وإزالة التكرار."""
    result = []
    seen = set()
    for perm in permissions or []:
        canonical = LEGACY_PERMISSION_ALIASES.get(perm, perm)
        if canonical not in seen:
            seen.add(canonical)
            result.append(canonical)
    return result


def get_effective_permissions(store, role):
    """صلاحيات الدور الفعلية للمتجر (مع تجاوز إعدادات المالك)."""
    if role.code == Role.Code.OWNER:
        return ['*']
    override = StoreRolePermission.objects.filter(store=store, role=role).first()
    if override and override.permissions is not None:
        return normalize_permissions(override.permissions)
    if role.permissions:
        return normalize_permissions(role.permissions)
    return list(DEFAULT_ROLE_PERMISSIONS.get(role.code, []))


def role_has_permission(request, *perm_codes):
    """هل للمستخدم صلاحية واحدة على الأقل من القائمة؟"""
    role = getattr(request, 'store_role', None)
    if role is None:
        return False
    store = getattr(request, 'store', None)
    if store is None:
        return False
    perms = get_effective_permissions(store, role)
    if '*' in perms:
        return True
    return any(p in perms for p in perm_codes)


def validate_permission_list(permissions):
    """التحقق من صحة قائمة الصلاحيات."""
    normalized = normalize_permissions(permissions)
    invalid = [p for p in normalized if p not in PERMISSION_LABELS]
    if invalid:
        raise ValueError(f'صلاحيات غير معروفة: {", ".join(invalid)}')
    return normalized
