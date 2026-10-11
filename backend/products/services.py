from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from products.models import InventoryLog, Product
from products.quantity import clamp_stock, to_qty


@transaction.atomic
def adjust_inventory(product, change, action, user=None, reference='', notes='',
                     client_request_id=None):
    from core.idempotency import normalize_client_request_id

    client_request_id = normalize_client_request_id(client_request_id)
    if client_request_id:
        existing = InventoryLog.objects.filter(
            store_id=product.store_id, client_request_id=client_request_id,
        ).select_related('product').first()
        if existing:
            existing.product._idempotent_replay = True
            return existing.product

    change = to_qty(change)
    try:
        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product.pk)
            before = to_qty(product.quantity)
            after = clamp_stock(before + change)
            product.quantity = after
            product.save(update_fields=['quantity', 'updated_at'])
            InventoryLog.objects.create(
                store=product.store,
                product=product,
                action=action,
                quantity_before=before,
                quantity_change=change,
                quantity_after=after,
                reference=reference,
                notes=notes,
                created_by=user,
                client_request_id=client_request_id,
            )
    except IntegrityError:
        if client_request_id:
            existing = InventoryLog.objects.filter(
                store_id=product.store_id, client_request_id=client_request_id,
            ).select_related('product').first()
            if existing:
                existing.product._idempotent_replay = True
                return existing.product
        raise
    return product


BULK_MAX_IDS = 200


def apply_product_bulk_action(store, ids, action, *, category=None):
    """Apply a bulk catalog/status change to products of a single store.

    Returns (updated_count, queryset_ids_touched).
    """
    ids = list(dict.fromkeys(int(i) for i in ids))[:BULK_MAX_IDS]
    qs = Product.objects.filter(store=store, pk__in=ids, is_active=True)
    if action in ('deactivate', 'activate'):
        qs = Product.objects.filter(store=store, pk__in=ids)

    if action in ('publish_catalog', 'unpublish_catalog', 'mark_offer', 'unmark_offer'):
        if not getattr(store, 'catalog_enabled', False):
            raise ValueError('ميزة معرض المتجر غير مفعّلة.')

    updates = {}
    if action == 'publish_catalog':
        updates = {'publish_in_catalog': True}
    elif action == 'unpublish_catalog':
        updates = {'publish_in_catalog': False, 'is_catalog_offer': False}
    elif action == 'mark_offer':
        updates = {'is_catalog_offer': True, 'publish_in_catalog': True}
    elif action == 'unmark_offer':
        updates = {'is_catalog_offer': False}
    elif action == 'deactivate':
        updates = {
            'is_active': False,
            'publish_in_catalog': False,
            'is_catalog_offer': False,
        }
    elif action == 'activate':
        updates = {'is_active': True}
    elif action == 'set_category':
        updates = {'category': category}
    else:
        raise ValueError('إجراء غير معروف.')

    updates['updated_at'] = timezone.now()
    matched_ids = list(qs.values_list('pk', flat=True))
    updated = qs.update(**updates)
    return updated, matched_ids
