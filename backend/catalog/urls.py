from django.urls import path

from catalog.public_views import (
    PublicCatalogCategoryView,
    PublicCatalogHomeView,
    PublicCatalogOffersView,
    PublicCatalogProductDetailView,
    PublicCatalogProductsView,
)
from catalog.views import StoreCatalogSettingsView

urlpatterns = [
    path('stores/catalog/', StoreCatalogSettingsView.as_view(), name='store-catalog-settings'),
    path('public/shop/<slug:slug>/', PublicCatalogHomeView.as_view(), name='public-catalog-home'),
    path('public/shop/<slug:slug>/products/', PublicCatalogProductsView.as_view(), name='public-catalog-products'),
    path(
        'public/shop/<slug:slug>/categories/<str:category_slug>/',
        PublicCatalogCategoryView.as_view(),
        name='public-catalog-category',
    ),
    path(
        'public/shop/<slug:slug>/products/<int:product_id>/',
        PublicCatalogProductDetailView.as_view(),
        name='public-catalog-product',
    ),
    path('public/shop/<slug:slug>/offers/', PublicCatalogOffersView.as_view(), name='public-catalog-offers'),
]
