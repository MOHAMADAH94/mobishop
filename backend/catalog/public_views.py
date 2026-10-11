from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.features import is_public_catalog_live
from catalog.public_serializers import (
    PublicCatalogCategorySerializer,
    PublicCatalogProductSerializer,
    PublicCatalogStoreSerializer,
)
from catalog.services import (
    apply_catalog_search,
    build_public_product,
    catalog_response,
    get_public_category,
    get_public_store,
    public_products_qs,
)
from marketplace.models import MarketplaceView
from marketplace.services import track_view
from stores.models import Store


class PublicCatalogMixin:
    def get_live_store(self, slug: str) -> Store:
        from catalog.models import StoreCatalogProfile

        profile = StoreCatalogProfile.objects.select_related('store').filter(slug=slug).first()
        if not profile or not is_public_catalog_live(profile.store):
            raise Http404
        return profile.store


class PublicCatalogHomeView(PublicCatalogMixin, APIView):
    """الصفحة الرئيسية — عرض التصنيفات."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        store = self.get_live_store(slug)
        track_view(MarketplaceView.EventType.STORE, store)
        data = catalog_response(store, request)
        return Response({
            'store': PublicCatalogStoreSerializer(data['store']).data,
            'categories': PublicCatalogCategorySerializer(data['categories'], many=True).data,
        })


class PublicCatalogProductsView(PublicCatalogMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        store = self.get_live_store(slug)
        qs = public_products_qs(store)
        category_slug = (request.query_params.get('category') or '').strip()
        if category_slug:
            category = get_public_category(store, category_slug)
            if not category:
                raise Http404
            qs = qs.filter(category=category)
        search = request.query_params.get('q', '')
        qs = apply_catalog_search(qs, search)
        products = [build_public_product(p, store, request) for p in qs]
        data = catalog_response(store, request, products=products)
        return Response({
            'store': PublicCatalogStoreSerializer(data['store']).data,
            'categories': PublicCatalogCategorySerializer(data['categories'], many=True).data,
            'products': PublicCatalogProductSerializer(data['products'], many=True).data,
        })


class PublicCatalogCategoryView(PublicCatalogMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, category_slug):
        store = self.get_live_store(slug)
        category = get_public_category(store, category_slug)
        if not category:
            raise Http404
        qs = public_products_qs(store).filter(category=category)
        qs = apply_catalog_search(qs, request.query_params.get('q', ''))
        products = [build_public_product(p, store, request) for p in qs]
        category_data = {
            'id': category.id,
            'name': category.name,
            'slug': category.slug,
            'description': category.description or '',
            'image_url': None,
            'featured': category.featured,
            'products_count': len(products),
        }
        data = catalog_response(store, request, category=category_data, products=products)
        return Response({
            'store': PublicCatalogStoreSerializer(data['store']).data,
            'categories': PublicCatalogCategorySerializer(data['categories'], many=True).data,
            'category': PublicCatalogCategorySerializer(data['category']).data,
            'products': PublicCatalogProductSerializer(data['products'], many=True).data,
        })


class PublicCatalogProductDetailView(PublicCatalogMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug, product_id):
        store = self.get_live_store(slug)
        qs = public_products_qs(store)
        product = qs.filter(pk=product_id).first()
        if not product:
            raise Http404
        data = catalog_response(store, request)
        return Response({
            'store': PublicCatalogStoreSerializer(data['store']).data,
            'categories': PublicCatalogCategorySerializer(data['categories'], many=True).data,
            'product': PublicCatalogProductSerializer(
                build_public_product(product, store, request),
            ).data,
        })


class PublicCatalogOffersView(PublicCatalogMixin, APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, slug):
        store = self.get_live_store(slug)
        qs = public_products_qs(store).filter(is_catalog_offer=True)
        products = [build_public_product(p, store, request) for p in qs]
        data = catalog_response(store, request, products=products)
        return Response({
            'store': PublicCatalogStoreSerializer(data['store']).data,
            'categories': PublicCatalogCategorySerializer(data['categories'], many=True).data,
            'products': PublicCatalogProductSerializer(data['products'], many=True).data,
        })
