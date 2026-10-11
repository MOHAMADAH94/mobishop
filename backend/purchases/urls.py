from django.urls import path
from rest_framework.routers import DefaultRouter

from purchases.views import PurchaseCreateView, PurchaseViewSet, SupplierViewSet

router = DefaultRouter()
router.register('suppliers', SupplierViewSet, basename='suppliers')
router.register('', PurchaseViewSet, basename='purchases')

urlpatterns = [
    path('create/', PurchaseCreateView.as_view(), name='purchase-create'),
] + router.urls
