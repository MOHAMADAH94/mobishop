from django.core.management.base import BaseCommand

from stores.models import Role, Store, StoreMembership


class Command(BaseCommand):
    help = 'Ensure every store owner has an active owner membership'

    def handle(self, *args, **options):
        owner_role = Role.objects.filter(code=Role.Code.OWNER).first()
        if not owner_role:
            self.stderr.write('Owner role missing. Run: python manage.py migrate')
            return

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

        self.stdout.write(self.style.SUCCESS(f'Fixed {fixed} store membership(s)'))
