from stores.models import StoreMembership


def ensure_store_context(request):
    """Resolve store from X-Store-Id after JWT auth (DRF runs after Django middleware)."""
    if getattr(request, 'store', None) is not None:
        return request.store

    store_id = request.headers.get('X-Store-Id')
    if not store_id or not getattr(request, 'user', None) or not request.user.is_authenticated:
        return None

    try:
        membership = StoreMembership.objects.select_related('store', 'role').get(
            store_id=int(store_id),
            user=request.user,
            is_active=True,
        )
        request.store = membership.store
        request.store_role = membership.role
        return request.store
    except (StoreMembership.DoesNotExist, ValueError, TypeError):
        return None
