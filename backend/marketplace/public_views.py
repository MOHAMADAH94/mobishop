from django.db.models import Q
from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from marketplace.models import MarketplaceView
from marketplace.public_serializers import (
    MarketplaceCategoryFilterSerializer,
    MarketplaceProductSerializer,
    MarketplaceStoreCardSerializer,
)
from marketplace.services import (
    _store_card,
    filter_marketplace_products,
    get_product_by_catalog_slug,
    live_stores_qs,
    marketplace_categories,
    marketplace_product_list,
    marketplace_products_qs,
    track_view,
)


class MarketplaceHomeView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        stores = live_stores_qs()
        featured_stores = [_store_card(s, request) for s in stores.filter(catalog_profile__featured=True)[:8]]
        new_stores = [_store_card(s, request) for s in stores.order_by('-created_at')[:8]]
        products_qs = marketplace_products_qs()
        latest = marketplace_product_list(products_qs.order_by('-created_at'), request, limit=12)
        offers = marketplace_product_list(
            products_qs.filter(is_catalog_offer=True).order_by('-updated_at'),
            request,
            limit=12,
        )
        return Response({
            'featured_stores': MarketplaceStoreCardSerializer(featured_stores, many=True).data,
            'new_stores': MarketplaceStoreCardSerializer(new_stores, many=True).data,
            'latest_products': MarketplaceProductSerializer(latest, many=True).data,
            'recent_products': MarketplaceProductSerializer(latest, many=True).data,
            'offers': MarketplaceProductSerializer(offers, many=True).data,
        })


class MarketplaceStoresView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        qs = live_stores_qs()
        search = (request.query_params.get('q') or '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(catalog_profile__description__icontains=search),
            )
        qs = qs.order_by('-catalog_profile__featured', '-created_at')
        stores = [_store_card(s, request) for s in qs]
        return Response({
            'stores': MarketplaceStoreCardSerializer(stores, many=True).data,
        })


class MarketplaceProductsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        qs = filter_marketplace_products(marketplace_products_qs(), request)
        products = marketplace_product_list(qs, request)
        categories = marketplace_categories(request)
        stores = [
            {'slug': s.catalog_profile.slug, 'name': s.name}
            for s in live_stores_qs().order_by('name')
        ]
        return Response({
            'products': MarketplaceProductSerializer(products, many=True).data,
            'categories': MarketplaceCategoryFilterSerializer(categories, many=True).data,
            'stores': stores,
        })


class MarketplaceOffersView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        qs = filter_marketplace_products(
            marketplace_products_qs().filter(is_catalog_offer=True),
            request,
        )
        products = marketplace_product_list(qs, request)
        return Response({
            'products': MarketplaceProductSerializer(products, many=True).data,
        })


class MarketplaceProductDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, catalog_slug):
        product = get_product_by_catalog_slug(catalog_slug)
        if not product:
            raise Http404
        track_view(MarketplaceView.EventType.PRODUCT, product.store, product)
        from marketplace.services import _marketplace_product

        profile = product.store.catalog_profile
        store_card = _store_card(product.store, request)
        store_data = {
            'name': product.store.name,
            'slug': profile.slug,
            'description': profile.description or '',
            'logo_url': store_card['logo_url'],
            'banner_url': store_card['banner_url'],
            'contact_phone': profile.contact_phone or product.store.phone,
            'whatsapp': profile.whatsapp or '',
            'telegram': profile.telegram or '',
            'currency': product.store.currency,
            'show_prices': profile.show_prices,
        }
        return Response({
            'product': MarketplaceProductSerializer(_marketplace_product(product, request)).data,
            'store': store_data,
        })
