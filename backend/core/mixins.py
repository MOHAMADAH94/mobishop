from rest_framework.exceptions import PermissionDenied

from core.store_context import ensure_store_context


class StoreQuerysetMixin:
    """Filter queryset by request.store for multi-tenant isolation."""

    store_field = 'store'

    def get_store(self):
        store = ensure_store_context(self.request)
        if store is None:
            raise PermissionDenied('يجب اختيار متجر أولاً.')
        return store

    def get_queryset(self):
        qs = super().get_queryset()
        store = self.get_store()
        return qs.filter(**{self.store_field: store})

    def perform_create(self, serializer):
        serializer.save(store=self.get_store())


class StoreOwnerMixin(StoreQuerysetMixin):
    """Ensure user has access to the store via membership."""

    def get_store(self):
        return super().get_store()
