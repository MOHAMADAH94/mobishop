from django.http import JsonResponse
from django.utils import timezone

from stores.models import Store, StoreMembership, Subscription

# Direct /media/ URLs for APKs must not be public — download via authenticated API.
_PRIVATE_MEDIA_PREFIXES = (
    '/media/store_apps/apks/',
)


class PrivateMediaMiddleware:
    """Block public direct access to sensitive media files (APKs)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path or ''
        if any(path.startswith(prefix) for prefix in _PRIVATE_MEDIA_PREFIXES):
            user = getattr(request, 'user', None)
            if user is not None and user.is_authenticated and user.is_staff:
                return self.get_response(request)
            return JsonResponse({'detail': 'غير مصرح.'}, status=403)
        return self.get_response(request)


class StoreContextMiddleware:
    """Attach active store from X-Store-Id header to request."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.store = None
        request.store_role = None

        # JWT is resolved in DRF; session auth works here
        if request.path.startswith('/api/'):
            try:
                from rest_framework_simplejwt.authentication import JWTAuthentication
                auth = JWTAuthentication().authenticate(request)
                if auth:
                    request.user = auth[0]
            except Exception:
                pass

        store_id = request.headers.get('X-Store-Id')
        if store_id and request.user.is_authenticated:
            try:
                membership = StoreMembership.objects.select_related('store', 'role').get(
                    store_id=int(store_id),
                    user=request.user,
                    is_active=True,
                )
                request.store = membership.store
                request.store_role = membership.role
            except (StoreMembership.DoesNotExist, ValueError, TypeError):
                pass

        return self.get_response(request)


class SubscriptionMiddleware:
    """Block write operations when subscription expired."""

    WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
    EXEMPT_PREFIXES = (
        '/api/auth/',
        '/admin/',
        '/api/stores/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method not in self.WRITE_METHODS:
            return self.get_response(request)

        if any(request.path.startswith(p) for p in self.EXEMPT_PREFIXES):
            return self.get_response(request)

        store = getattr(request, 'store', None)
        if store is None:
            return self.get_response(request)

        try:
            sub = store.subscription
        except Subscription.DoesNotExist:
            return self.get_response(request)

        if sub.status == Subscription.Status.EXPIRED:
            return JsonResponse(
                {'detail': 'انتهى اشتراك المتجر. يرجى تجديد الاشتراك.'},
                status=402,
            )

        if sub.status == Subscription.Status.TRIAL and sub.trial_ends_at:
            if timezone.now() > sub.trial_ends_at:
                sub.status = Subscription.Status.EXPIRED
                sub.save(update_fields=['status', 'updated_at'])
                return JsonResponse(
                    {'detail': 'انتهت الفترة التجريبية.'},
                    status=402,
                )

        return self.get_response(request)
