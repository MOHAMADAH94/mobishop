"""Marketplace queries and DTO builders — lightweight, catalog-focused."""

from django.db.models import Count, Q

from catalog.features import get_catalog_profile, is_public_catalog_live
from catalog.services import _media_url, apply_catalog_search, build_public_product, public_products_qs
from marketplace.models import MarketplaceView
from products.models import Category, Product
from stores.models import Store


def live_stores_qs():
    """Stores visible in the public marketplace."""
    return (
        Store.objects.filter(
            catalog_enabled=True,
            is_active=True,
            catalog_profile__is_public=True,
        )
        .exclude(catalog_profile__slug__isnull=True)
        .exclude(catalog_profile__slug='')
        .select_related('catalog_profile')
        .annotate(
            catalog_products_count=Count(
                'products',
                filter=Q(
                    products__is_active=True,
                    products__publish_in_catalog=True,
                ),
            ),
        )
        .filter(catalog_products_count__gt=0)
    )


def marketplace_products_qs():
    """Published catalog products from all live stores."""
    live_ids = live_stores_qs().values_list('id', flat=True)
    qs = Product.objects.filter(
        store_id__in=live_ids,
        is_active=True,
        publish_in_catalog=True,
    ).select_related('category', 'store', 'store__catalog_profile')
    qs = qs.exclude(category__show_in_catalog=False)
    return qs


def _store_card(store, request):
    profile = store.catalog_profile
    logo = profile.catalog_logo if profile.catalog_logo else store.logo
    return {
        'name': store.name,
        'slug': profile.slug,
        'description': profile.description or '',
        'logo_url': _media_url(request, logo),
        'banner_url': _media_url(request, profile.banner) if profile.banner else None,
        'products_count': getattr(store, 'catalog_products_count', 0),
        'featured': profile.featured,
        'joined_at': store.created_at.isoformat(),
        'contact_phone': profile.contact_phone or store.phone,
        'whatsapp': profile.whatsapp or '',
        'telegram': profile.telegram or '',
    }


def _marketplace_product(product, request):
    data = build_public_product(product, product.store, request)
    profile = get_catalog_profile(product.store)
    store = product.store
    logo = profile.catalog_logo if profile and profile.catalog_logo else store.logo
    data.update({
        'catalog_slug': product.catalog_slug or str(product.id),
        'store_name': store.name,
        'store_slug': profile.slug if profile else '',
        'store_logo_url': _media_url(request, logo),
    })
    return data


def marketplace_product_list(qs, request, limit=None):
    if limit:
        qs = qs[:limit]
    return [_marketplace_product(p, request) for p in qs]


def track_view(event_type, store, product=None):
    MarketplaceView.objects.create(
        event_type=event_type,
        store=store,
        product=product,
    )


def store_analytics(store):
    from django.db.models import Count

    store_views = MarketplaceView.objects.filter(store=store, event_type=MarketplaceView.EventType.STORE).count()
    product_views = MarketplaceView.objects.filter(store=store, event_type=MarketplaceView.EventType.PRODUCT).count()
    top_products = (
        MarketplaceView.objects.filter(store=store, event_type=MarketplaceView.EventType.PRODUCT, product__isnull=False)
        .values('product_id', 'product__name', 'product__catalog_slug')
        .annotate(views=Count('id'))
        .order_by('-views')[:10]
    )
    return {
        'store_views': store_views,
        'product_views': product_views,
        'top_products': [
            {
                'id': row['product_id'],
                'name': row['product__name'],
                'catalog_slug': row['product__catalog_slug'],
                'views': row['views'],
            }
            for row in top_products
        ],
    }


def filter_marketplace_products(qs, request):
    qs = apply_catalog_search(qs, request.query_params.get('q', ''))
    store_slug = (request.query_params.get('store') or '').strip()
    if store_slug:
        qs = qs.filter(store__catalog_profile__slug=store_slug)
    category_slug = (request.query_params.get('category') or '').strip()
    if category_slug:
        qs = qs.filter(category__slug=category_slug, category__show_in_catalog=True)
    availability = request.query_params.get('availability')
    if availability == 'in_stock':
        qs = qs.filter(quantity__gt=0)
    elif availability == 'out_of_stock':
        qs = qs.filter(quantity=0)
    return qs.order_by('-created_at')


def marketplace_categories(request):
    """Distinct visible categories across live stores with product counts."""
    live_ids = list(live_stores_qs().values_list('id', flat=True))
    if not live_ids:
        return []
    qs = (
        Category.objects.filter(store_id__in=live_ids, show_in_catalog=True)
        .exclude(slug__isnull=True)
        .exclude(slug='')
        .values('slug', 'name')
        .annotate(products_count=Count('products', filter=Q(
            products__is_active=True,
            products__publish_in_catalog=True,
            products__store_id__in=live_ids,
        )))
        .filter(products_count__gt=0)
        .order_by('name')
    )
    return list(qs)


def get_product_by_catalog_slug(catalog_slug):
    qs = marketplace_products_qs().filter(catalog_slug=catalog_slug)
    return qs.first()


def get_live_store_by_slug(slug):
    store = live_stores_qs().filter(catalog_profile__slug=slug).first()
    if store and is_public_catalog_live(store):
        return store
    return None
