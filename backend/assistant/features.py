"""Feature flag for AI Smart Assistant — mirrors catalog/store_app pattern."""


def is_ai_assistant_feature_enabled(store) -> bool:
    """Whether the store may use the smart assistant (super-admin flag)."""
    if not store or not store.is_active:
        return False
    return bool(getattr(store, 'ai_assistant_enabled', True))
