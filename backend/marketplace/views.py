from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.features import is_catalog_feature_enabled
from core.permissions import HasStoreAccess, IsStoreOwner
from core.store_context import ensure_store_context
from marketplace.services import store_analytics


class MarketplaceAnalyticsView(APIView):
    """إحصائيات السوق العام — للمالك فقط."""
    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]

    def get(self, request):
        store = ensure_store_context(request)
        if not is_catalog_feature_enabled(store):
            return Response({'detail': 'ميزة المعرض غير مفعّلة.'}, status=403)
        return Response(store_analytics(store))
