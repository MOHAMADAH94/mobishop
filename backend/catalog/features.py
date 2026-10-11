"""Feature flags for Store Catalog — ready for future subscription plans."""

from catalog.models import StoreCatalogProfile


def is_catalog_feature_enabled(store) -> bool:
    """Whether the store may use catalog features at all (super-admin flag)."""
    if not store or not store.is_active:
        return False
    return bool(store.catalog_enabled)
    # Future: return store.catalog_enabled and plan_includes(store, 'catalog')


def get_catalog_profile(store) -> StoreCatalogProfile | None:
    if not store:
        return None
    return StoreCatalogProfile.objects.filter(store=store).first()


def is_public_catalog_live(store) -> bool:
    """Catalog is enabled, published, and has a slug."""
    if not is_catalog_feature_enabled(store):
        return False
    profile = get_catalog_profile(store)
    if not profile or not profile.is_public or not profile.slug:
        return False
    return True
