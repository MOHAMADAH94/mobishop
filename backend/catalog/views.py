from rest_framework import generics
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated

from catalog.features import is_catalog_feature_enabled
from catalog.models import StoreCatalogProfile
from catalog.serializers import StoreCatalogProfileSerializer
from core.permissions import HasStoreAccess, IsStoreOwner
from core.store_context import ensure_store_context


class StoreCatalogSettingsView(generics.RetrieveUpdateAPIView):
    """إعدادات store catalog المتجر — للمالك فقط عند تفعيل الميزة."""
    serializer_class = StoreCatalogProfileSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self):
        store = ensure_store_context(self.request)
        if not store:
            raise PermissionDenied('لم يتم تحديد المتجر.')
        store.refresh_from_db(fields=['catalog_enabled', 'is_active'])
        if not is_catalog_feature_enabled(store):
            raise PermissionDenied('ميزة معرض المتجر غير مفعّلة لهذا المتجر. تواصل مع إدارة المنصة.')
        profile, _ = StoreCatalogProfile.objects.get_or_create(store=store)
        return profile

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['store'] = ensure_store_context(self.request)
        return ctx
