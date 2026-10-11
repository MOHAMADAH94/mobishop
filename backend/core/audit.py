import logging

from django.core.exceptions import ValidationError
from django.core.validators import validate_ipv46_address

from core.models import AuditLog

logger = logging.getLogger(__name__)


def _client_ip(request):
    forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
    ip = forwarded.split(',')[0].strip() if forwarded else request.META.get('REMOTE_ADDR')
    if not ip:
        return None
    try:
        validate_ipv46_address(ip)
        return ip
    except ValidationError:
        return None


def log_audit(request, action, model_name, object_id='', details=None):
    """Never break API responses if audit logging fails."""
    try:
        store = getattr(request, 'store', None)
        user = request.user if request.user.is_authenticated else None
        AuditLog.objects.create(
            store=store,
            user=user,
            action=action,
            model_name=model_name,
            object_id=str(object_id) if object_id else '',
            details=details or {},
            ip_address=_client_ip(request),
        )
    except Exception:
        logger.exception('Audit log failed for %s %s', model_name, object_id)