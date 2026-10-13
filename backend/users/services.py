"""حذف حساب مستخدم مع متاجره وبياناتها المرتبطة (للحسابات التجريبية والتنظيف الآمن)."""

from __future__ import annotations

from dataclasses import dataclass, field

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count

from stores.models import Store, StoreMembership, Subscription

User = get_user_model()


class PurgeBlocked(Exception):
    """يُرفع عندما لا يُسمح بحذف الحساب."""


@dataclass
class StorePurgeInfo:
    id: int
    name: str
    subscription_status: str | None
    members_count: int
    products_count: int
    sales_count: int


@dataclass
class UserPurgePreview:
    user_id: int
    username: str
    email: str
    is_staff: bool
    is_superuser: bool
    owned_stores: list[StorePurgeInfo] = field(default_factory=list)
    orphan_member_usernames: list[str] = field(default_factory=list)
    external_memberships_count: int = 0
    warnings: list[str] = field(default_factory=list)
    blocked_reason: str | None = None

    @property
    def can_purge(self) -> bool:
        return self.blocked_reason is None


@dataclass
class UserPurgeResult:
    username: str
    deleted_store_ids: list[int]
    deleted_orphan_usernames: list[str]


def _store_info(store: Store) -> StorePurgeInfo:
    sub_status = None
    try:
        sub_status = store.subscription.status
    except Subscription.DoesNotExist:
        pass
    return StorePurgeInfo(
        id=store.pk,
        name=store.name,
        subscription_status=sub_status,
        members_count=getattr(store, '_members', 0) or 0,
        products_count=getattr(store, '_products', 0) or 0,
        sales_count=getattr(store, '_sales', 0) or 0,
    )


def _owned_stores_qs(user):
    return (
        Store.objects.filter(owner=user)
        .select_related('subscription')
        .annotate(
            _members=Count('memberships', distinct=True),
            _products=Count('products', distinct=True),
            _sales=Count('sales', distinct=True),
        )
        .order_by('name')
    )


def _find_orphan_members(owned_store_ids: list[int], owner_id: int) -> list:
    """مستخدمون مرتبطون فقط بالمتاجر المحذوفة وليسوا ملاك متاجر أخرى."""
    if not owned_store_ids:
        return []

    member_ids = (
        StoreMembership.objects.filter(store_id__in=owned_store_ids)
        .exclude(user_id=owner_id)
        .values_list('user_id', flat=True)
        .distinct()
    )
    orphans = []
    for mid in member_ids:
        try:
            member = User.objects.get(pk=mid)
        except User.DoesNotExist:
            continue
        if member.is_superuser or member.is_staff:
            continue
        owns_other = Store.objects.filter(owner=member).exclude(pk__in=owned_store_ids).exists()
        if owns_other:
            continue
        has_other_membership = (
            StoreMembership.objects.filter(user=member)
            .exclude(store_id__in=owned_store_ids)
            .exists()
        )
        if has_other_membership:
            continue
        orphans.append(member)
    return orphans


def preview_user_purge(user, *, actor=None, delete_orphan_members: bool = True) -> UserPurgePreview:
    owned = list(_owned_stores_qs(user))
    owned_ids = [s.pk for s in owned]
    external_memberships = (
        StoreMembership.objects.filter(user=user)
        .exclude(store_id__in=owned_ids)
        .count()
        if owned_ids
        else StoreMembership.objects.filter(user=user).exclude(store__owner=user).count()
    )

    warnings: list[str] = []
    blocked_reason = None

    if actor is not None and actor.pk == user.pk:
        blocked_reason = 'لا يمكنك حذف حسابك أثناء تسجيل الدخول به.'
    elif user.is_superuser:
        blocked_reason = 'لا يمكن حذف حساب مدير نظام (superuser).'
    elif user.is_staff:
        blocked_reason = 'لا يمكن حذف حساب موظف لوحة التحكم (staff). عطّل الصلاحية أولاً إن لزم.'

    for store in owned:
        info = _store_info(store)
        if info.subscription_status == Subscription.Status.ACTIVE:
            warnings.append(
                f'المتجر «{store.name}» اشتراكه نشط (active) — تأكد أنه حساب تجريبي قبل الحذف.'
            )
        if info.sales_count > 0:
            warnings.append(
                f'المتجر «{store.name}» يحتوي على {info.sales_count} عملية بيع ستُحذف نهائياً.'
            )

    if external_memberships:
        warnings.append(
            f'لدى المستخدم {external_memberships} عضوية في متاجر لا يملكها '
            f'(ستُحذف العضويات مع الحساب دون حذف تلك المتاجر).'
        )

    orphans = _find_orphan_members(owned_ids, user.pk) if delete_orphan_members else []
    if orphans:
        warnings.append(
            'سيُحذف أيضاً موظفو/أعضاء هؤلاء لأنهم مرتبطون فقط بالمتاجر المحذوفة: '
            + '، '.join(o.username for o in orphans)
        )

    return UserPurgePreview(
        user_id=user.pk,
        username=user.username,
        email=user.email or '',
        is_staff=user.is_staff,
        is_superuser=user.is_superuser,
        owned_stores=[_store_info(s) for s in owned],
        orphan_member_usernames=[o.username for o in orphans],
        external_memberships_count=external_memberships,
        warnings=warnings,
        blocked_reason=blocked_reason,
    )


@transaction.atomic
def purge_user_account(
    user,
    *,
    actor=None,
    delete_orphan_members: bool = True,
) -> UserPurgeResult:
    """
    يحذف متاجر المستخدم المملوكة (وكل بيانات CASCADE المرتبطة بها) ثم يحذف الحساب.

    الترتيب مهم: Store.owner = PROTECT يمنع حذف المستخدم قبل حذف متاجره.
    """
    preview = preview_user_purge(
        user, actor=actor, delete_orphan_members=delete_orphan_members,
    )
    if not preview.can_purge:
        raise PurgeBlocked(preview.blocked_reason)

    owned_stores = list(Store.objects.filter(owner=user))
    owned_ids = [s.pk for s in owned_stores]
    orphans = _find_orphan_members(owned_ids, user.pk) if delete_orphan_members else []

    deleted_store_ids = list(owned_ids)
    for store in owned_stores:
        store.delete()

    deleted_orphan_usernames = []
    for member in orphans:
        deleted_orphan_usernames.append(member.username)
        member.delete()

    username = user.username
    user.delete()

    if actor is not None:
        try:
            from core.models import AuditLog

            AuditLog.objects.create(
                store=None,
                user=actor,
                action=AuditLog.Action.DELETE,
                model_name='users.User',
                object_id=str(preview.user_id),
                details={
                    'purged_username': username,
                    'deleted_store_ids': deleted_store_ids,
                    'deleted_orphan_usernames': deleted_orphan_usernames,
                },
            )
        except Exception:
            # لا نُفشل الحذف بسبب سجل التدقيق
            pass

    return UserPurgeResult(
        username=username,
        deleted_store_ids=deleted_store_ids,
        deleted_orphan_usernames=deleted_orphan_usernames,
    )


@transaction.atomic
def purge_store_and_maybe_owner(store: Store, *, actor=None, delete_owner_if_empty: bool = True):
    """
    يحذف متجراً واحداً. إن لم يعد المالك يملك متاجر أخرى ولا عضويات خارجية،
    يُحذف حساب المالك أيضاً (مناسب للحسابات التجريبية).
    """
    owner = store.owner
    store_id = store.pk
    store_name = store.name
    store.delete()

    owner_deleted = False
    if delete_owner_if_empty and owner and not owner.is_superuser and not owner.is_staff:
        still_owns = Store.objects.filter(owner=owner).exists()
        still_member = StoreMembership.objects.filter(user=owner).exists()
        if not still_owns and not still_member:
            if actor is None or actor.pk != owner.pk:
                owner_username = owner.username
                owner.delete()
                owner_deleted = True
                if actor is not None:
                    try:
                        from core.models import AuditLog

                        AuditLog.objects.create(
                            store=None,
                            user=actor,
                            action=AuditLog.Action.DELETE,
                            model_name='stores.Store',
                            object_id=str(store_id),
                            details={
                                'store_name': store_name,
                                'owner_username': owner_username,
                                'owner_deleted': True,
                            },
                        )
                    except Exception:
                        pass
                return {'store_id': store_id, 'owner_deleted': True, 'owner_username': owner_username}

    return {'store_id': store_id, 'owner_deleted': owner_deleted, 'owner_username': None}
