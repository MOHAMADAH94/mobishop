from rest_framework.permissions import BasePermission

from core.role_permissions import role_has_permission
from core.store_context import ensure_store_context
from stores.models import Role


class HasStoreAccess(BasePermission):
    def has_permission(self, request, view):
        return ensure_store_context(request) is not None


class IsStoreOwner(BasePermission):
    def has_permission(self, request, view):
        ensure_store_context(request)
        role = getattr(request, 'store_role', None)
        return role is not None and role.code == Role.Code.OWNER


class IsOwnerOrManager(BasePermission):
    def has_permission(self, request, view):
        ensure_store_context(request)
        role = getattr(request, 'store_role', None)
        if role is None:
            return False
        return role.code in (Role.Code.OWNER, Role.Code.MANAGER)


class IsCashierOrAbove(BasePermission):
    """أي عضو نشط في المتجر."""

    def has_permission(self, request, view):
        ensure_store_context(request)
        role = getattr(request, 'store_role', None)
        return role is not None


def HasPermission(*perm_codes):
    """مصنع فئات صلاحية — يتحقق من صلاحية واحدة على الأقل."""

    class _HasStorePermission(BasePermission):
        def has_permission(self, request, view):
            ensure_store_context(request)
            return role_has_permission(request, *perm_codes)

    _HasStorePermission.__name__ = f'HasPermission_{"_".join(perm_codes)}'
    return _HasStorePermission
