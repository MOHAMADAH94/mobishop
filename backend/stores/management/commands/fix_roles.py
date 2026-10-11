from django.core.management.base import BaseCommand

from core.role_permissions import DEFAULT_ROLE_PERMISSIONS, normalize_permissions
from stores.models import Role, StoreRolePermission
from stores.signals import seed_roles


class Command(BaseCommand):
    help = 'Fix role names and normalize legacy permissions (e.g. reports -> dashboard)'

    def handle(self, *args, **options):
        seed_roles()
        for role in Role.objects.exclude(code=Role.Code.OWNER):
            normalized = normalize_permissions(role.permissions)
            if not normalized:
                normalized = list(DEFAULT_ROLE_PERMISSIONS.get(role.code, []))
            if normalized != list(role.permissions or []):
                role.permissions = normalized
                role.save(update_fields=['permissions'])
        for override in StoreRolePermission.objects.all():
            normalized = normalize_permissions(override.permissions)
            if normalized != list(override.permissions or []):
                override.permissions = normalized
                override.save(update_fields=['permissions'])
        for role in Role.objects.all().order_by('code'):
            self.stdout.write(f'{role.code}: OK')
