"""Feature gate for Store Android App Generator — mirrors catalog_enabled pattern."""


def is_store_app_feature_enabled(store) -> bool:
    if not store or not store.is_active:
        return False
    return bool(getattr(store, 'store_app_enabled', False))
    # Future: return store.store_app_enabled and plan_includes(store, 'store_app')
