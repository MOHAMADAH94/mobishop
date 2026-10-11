from datetime import timedelta

from django.conf import settings
from django.db.models.signals import post_migrate, post_save
from django.dispatch import receiver
from django.utils import timezone

from stores.models import Role, Store, StoreMembership, StoreSettings, Subscription
from stores.currency_service import ensure_base_currency_row


@receiver(post_save, sender=Store)
def create_store_related(sender, instance, created, **kwargs):
    if not created:
        return
    StoreSettings.objects.get_or_create(store=instance)
    trial_days = getattr(settings, 'TRIAL_DAYS', 14)
    Subscription.objects.get_or_create(
        store=instance,
        defaults={
            'status': Subscription.Status.TRIAL,
            'trial_ends_at': timezone.now() + timedelta(days=trial_days),
        },
    )
    if not Role.objects.filter(code=Role.Code.OWNER).exists():
        seed_roles()
    owner_role = Role.objects.filter(code=Role.Code.OWNER).first()
    if owner_role:
        StoreMembership.objects.get_or_create(
            store=instance,
            user=instance.owner,
            defaults={'role': owner_role, 'is_active': True},
        )
    ensure_base_currency_row(instance)


def seed_roles():
    from core.role_permissions import DEFAULT_ROLE_PERMISSIONS

    roles = [
        (Role.Code.OWNER, 'مالك', DEFAULT_ROLE_PERMISSIONS[Role.Code.OWNER]),
        (Role.Code.MANAGER, 'مدير', DEFAULT_ROLE_PERMISSIONS[Role.Code.MANAGER]),
        (Role.Code.CASHIER, 'كاشير', DEFAULT_ROLE_PERMISSIONS[Role.Code.CASHIER]),
        (Role.Code.TECHNICIAN, 'فني صيانة', DEFAULT_ROLE_PERMISSIONS[Role.Code.TECHNICIAN]),
    ]
    for code, name, perms in roles:
        Role.objects.get_or_create(
            code=code,
            defaults={'name': name, 'permissions': perms},
        )


@receiver(post_migrate)
def on_migrate(sender, **kwargs):
    from django.db import connection

    if sender.name != 'stores':
        return
    if 'stores_role' not in connection.introspection.table_names():
        return
    seed_roles()
