"""Generate unique product barcodes within a store (Code 128 compatible numeric)."""
from __future__ import annotations

import secrets
import time

from django.db import IntegrityError, transaction

from products.models import Product


def _candidate(store_id: int) -> str:
    # Compact scannable code: store prefix + time + random
    stamp = int(time.time()) % 10_000_000
    rand = secrets.randbelow(10_000)
    return f'{store_id:04d}{stamp:07d}{rand:04d}'[:20]


@transaction.atomic
def generate_unique_barcode(store, product=None, *, max_attempts: int = 25) -> str:
    """Return a barcode unique for this store. Optionally assign to product."""
    store_id = store.pk
    for _ in range(max_attempts):
        code = _candidate(store_id)
        qs = Product.objects.filter(store_id=store_id, barcode=code)
        if product is not None:
            qs = qs.exclude(pk=product.pk)
        if qs.exists():
            continue
        if product is None:
            return code
        product.barcode = code
        try:
            product.save(update_fields=['barcode', 'updated_at'])
            return code
        except IntegrityError:
            continue
    raise ValueError('تعذّر توليد باركود فريد. حاول مجدداً.')
