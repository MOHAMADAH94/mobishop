from django.core.management.base import BaseCommand

from stores.models import Role, Store, StoreMembership
from stores.signals import seed_roles


class Command(BaseCommand):
    help = 'تهيئة الأدوار وربط المالك بكل المتاجر (بعد النشر على الاستضافة)'

    def handle(self, *args, **options):
        seed_roles()
        owner_role = Role.objects.get(code=Role.Code.OWNER)
        fixed = 0
        for store in Store.objects.all():
            membership, created = StoreMembership.objects.get_or_create(
                store=store,
                user=store.owner,
                defaults={'role': owner_role, 'is_active': True},
            )
            if created:
                fixed += 1
            elif not membership.is_active or membership.role_id != owner_role.id:
                membership.role = owner_role
                membership.is_active = True
                membership.save()
                fixed += 1
        self.stdout.write(self.style.SUCCESS(f'Roles ready. Fixed {fixed} membership(s).'))
