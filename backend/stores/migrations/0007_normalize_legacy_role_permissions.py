from django.db import migrations

LEGACY_ALIASES = {'reports': 'dashboard'}

DEFAULT_MANAGER = [
    'dashboard', 'pos', 'sales', 'sales_cancel', 'sales_return',
    'products', 'categories', 'inventory', 'customers', 'expenses',
    'repairs', 'settings',
]
DEFAULT_CASHIER = [
    'dashboard', 'pos', 'sales', 'sales_return',
    'customers_read', 'products_read',
]
DEFAULT_TECHNICIAN = [
    'dashboard', 'repairs', 'customers_read', 'products_read',
]
DEFAULTS = {
    'manager': DEFAULT_MANAGER,
    'cashier': DEFAULT_CASHIER,
    'technician': DEFAULT_TECHNICIAN,
}


def _normalize(permissions):
    result = []
    seen = set()
    for perm in permissions or []:
        canonical = LEGACY_ALIASES.get(perm, perm)
        if canonical not in seen:
            seen.add(canonical)
            result.append(canonical)
    return result


def normalize_legacy_permissions(apps, schema_editor):
    Role = apps.get_model('stores', 'Role')
    StoreRolePermission = apps.get_model('stores', 'StoreRolePermission')

    for role in Role.objects.all():
        if role.code == 'owner':
            continue
        normalized = _normalize(role.permissions)
        if not normalized:
            normalized = list(DEFAULTS.get(role.code, []))
        if normalized != list(role.permissions or []):
            role.permissions = normalized
            role.save(update_fields=['permissions'])

    for override in StoreRolePermission.objects.all():
        normalized = _normalize(override.permissions)
        if normalized != list(override.permissions or []):
            override.permissions = normalized
            override.save(update_fields=['permissions'])


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0006_alter_role_code'),
    ]

    operations = [
        migrations.RunPython(normalize_legacy_permissions, migrations.RunPython.noop),
    ]
