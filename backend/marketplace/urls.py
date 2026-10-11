from django.urls import path

from marketplace.public_views import (
    MarketplaceHomeView,
    MarketplaceOffersView,
    MarketplaceProductDetailView,
    MarketplaceProductsView,
    MarketplaceStoresView,
)
from marketplace.views import MarketplaceAnalyticsView

urlpatterns = [
    path('public/marketplace/', MarketplaceHomeView.as_view(), name='marketplace-home'),
    path('public/marketplace/stores/', MarketplaceStoresView.as_view(), name='marketplace-stores'),
    path('public/marketplace/products/', MarketplaceProductsView.as_view(), name='marketplace-products'),
    path('public/marketplace/offers/', MarketplaceOffersView.as_view(), name='marketplace-offers'),
    path(
        'public/marketplace/products/<slug:catalog_slug>/',
        MarketplaceProductDetailView.as_view(),
        name='marketplace-product-detail',
    ),
    path('stores/marketplace-analytics/', MarketplaceAnalyticsView.as_view(), name='marketplace-analytics'),
]
