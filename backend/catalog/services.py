from catalog.features import get_catalog_profile, is_catalog_feature_enabled
from products.models import Category, Product


def _media_url(request, field):
    if not field:
        return None
    url = field.url
    if request and url.startswith('/'):
        return request.build_absolute_uri(url)
    return url


def get_public_store(store, request):
    profile = get_catalog_profile(store)
    logo = profile.catalog_logo if profile and profile.catalog_logo else store.logo
    return {
        'name': store.name,
        'slug': profile.slug,
        'description': profile.description if profile else '',
        'logo_url': _media_url(request, logo),
        'banner_url': _media_url(request, profile.banner) if profile and profile.banner else None,
        'contact_phone': profile.contact_phone if profile else store.phone,
        'whatsapp': profile.whatsapp if profile else '',
        'telegram': profile.telegram if profile else '',
        'address': profile.address if profile else '',
        'latitude': float(profile.latitude) if profile and profile.latitude is not None else None,
        'longitude': float(profile.longitude) if profile and profile.longitude is not None else None,
        'currency': store.currency,
        'show_prices': profile.show_prices if profile else True,
    }


def _published_product_filter(store):
    from django.db.models import Q

    profile = get_catalog_profile(store)
    filt = Q(products__is_active=True, products__publish_in_catalog=True)
    if profile and not profile.show_out_of_stock:
        filt &= Q(products__quantity__gt=0)
    return filt


def public_products_qs(store):
    from django.db.models import Q

    profile = get_catalog_profile(store)
    if not profile or not is_catalog_feature_enabled(store):
        return Product.objects.none()
    qs = Product.objects.filter(
        store=store,
        is_active=True,
        publish_in_catalog=True,
    ).select_related('category')
    if not profile.show_out_of_stock:
        qs = qs.filter(quantity__gt=0)
    qs = qs.exclude(category__show_in_catalog=False)
    return qs.order_by('name')


def apply_catalog_search(qs, search: str):
    from django.db.models import Q

    term = (search or '').strip()
    if not term:
        return qs
    return qs.filter(Q(name__icontains=term) | Q(category__name__icontains=term))


def public_categories_qs(store):
    from django.db.models import Count

    if not is_catalog_feature_enabled(store):
        return Category.objects.none()
    return (
        Category.objects.filter(store=store, show_in_catalog=True)
        .exclude(slug__isnull=True)
        .exclude(slug='')
        .annotate(catalog_products_count=Count('products', filter=_published_product_filter(store)))
        .filter(catalog_products_count__gt=0)
        .order_by('-featured', 'sort_order', 'name')
    )


def get_public_category(store, category_slug: str):
    from urllib.parse import unquote

    slug = unquote((category_slug or '').strip())
    if not slug:
        return None
    return public_categories_qs(store).filter(slug=slug).first()


def build_public_category(category, request, products_count=None):
    return {
        'id': category.id,
        'name': category.name,
        'slug': category.slug,
        'description': category.description or '',
        'image_url': None,
        'featured': category.featured,
        'products_count': products_count if products_count is not None else getattr(category, 'catalog_products_count', 0),
    }


def get_public_categories_list(store, request):
    return [
        build_public_category(c, request)
        for c in public_categories_qs(store)
    ]


def build_public_product(product, store, request):
    profile = get_catalog_profile(store)
    show_prices = profile.show_prices if profile else True
    return {
        'id': product.id,
        'name': product.name,
        'description': product.description or '',
        'image_url': _media_url(request, product.image),
        'category_name': product.category.name if product.category_id else '',
        'category_slug': product.category.slug if product.category_id else '',
        'sell_price': str(product.sell_price) if show_prices else None,
        'in_stock': product.quantity > 0,
        'is_offer': product.is_catalog_offer,
        'catalog_slug': product.catalog_slug or str(product.id),
    }


def catalog_response(store, request, **extra):
    return {
        'store': get_public_store(store, request),
        'categories': get_public_categories_list(store, request),
        **extra,
    }
