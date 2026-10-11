"""Helpers for offline sync idempotency via client_request_id."""

from django.db.models import Q


def normalize_client_request_id(value):
    if value is None:
        return None
    value = str(value).strip()[:64]
    return value or None


def client_request_unique_constraint(name: str):
    from django.db import models

    return models.UniqueConstraint(
        fields=['store', 'client_request_id'],
        condition=Q(client_request_id__isnull=False) & ~Q(client_request_id=''),
        name=name,
    )


CLIENT_REQUEST_FIELD_KWARGS = dict(
    max_length=64,
    blank=True,
    null=True,
    help_text='معرّف فريد من العميل لمنع تكرار العملية عند المزامنة دون اتصال',
)
