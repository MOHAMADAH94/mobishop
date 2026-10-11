"""استعلامات مجمّعة لإحصائيات مبيعات المنتجات — تُستخدم في محرك القرارات."""

from datetime import timedelta
from decimal import Decimal

from django.db.models import F, Max, Sum
from django.utils import timezone

from core.date_ranges import local_day_bounds
from core.product_stats import ACTIVE_SALE_STATUSES
from sales.models import SaleItem


def bulk_product_sales_metrics(store, product_ids):
    """إحصائيات مبيعات لكل منتج في استعلامات قليلة بدلاً من N+1."""
    if not product_ids:
        return {}, {}, {}, {}

    today = timezone.localdate()
    base = SaleItem.objects.filter(
        product_id__in=product_ids,
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
    )

    last_sale = {
        row['product_id']: row['last_at']
        for row in base.values('product_id').annotate(last_at=Max('sale__created_at'))
    }

    start_30, _ = local_day_bounds(today - timedelta(days=30))
    _, end_today = local_day_bounds(today)
    sold_30 = {
        row['product_id']: int(row['sold'] or 0)
        for row in base.filter(
            sale__created_at__gte=start_30,
            sale__created_at__lt=end_today,
        ).values('product_id').annotate(sold=Sum(F('quantity') - F('quantity_returned')))
    }

    start_recent, _ = local_day_bounds(today - timedelta(days=7))
    _, end_recent = local_day_bounds(today)
    sold_recent = {
        row['product_id']: int(row['sold'] or 0)
        for row in base.filter(
            sale__created_at__gte=start_recent,
            sale__created_at__lt=end_recent,
        ).values('product_id').annotate(sold=Sum(F('quantity') - F('quantity_returned')))
    }

    start_prev, _ = local_day_bounds(today - timedelta(days=14))
    _, end_prev = local_day_bounds(today - timedelta(days=7))
    sold_previous = {
        row['product_id']: int(row['sold'] or 0)
        for row in base.filter(
            sale__created_at__gte=start_prev,
            sale__created_at__lt=end_prev,
        ).values('product_id').annotate(sold=Sum(F('quantity') - F('quantity_returned')))
    }

    avg_daily = {
        pid: Decimal(sold_30.get(pid, 0)) / Decimal(30)
        for pid in product_ids
    }

    return last_sale, avg_daily, sold_recent, sold_previous
