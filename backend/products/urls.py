from django.urls import path
from rest_framework.routers import DefaultRouter

from products.views import (
    CategoryViewSet,
    InventoryLogListView,
    ProductLookupView,
    ProductSearchView,
    ProductViewSet,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='categories')
router.register('', ProductViewSet, basename='products')

urlpatterns = [
    path('search/', ProductSearchView.as_view(), name='product-search'),
    path('lookup/', ProductLookupView.as_view(), name='product-lookup'),
    path('inventory-logs/', InventoryLogListView.as_view(), name='inventory-logs'),
] + router.urls
