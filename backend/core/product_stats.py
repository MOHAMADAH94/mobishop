import logging
from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.utils import timezone
from django.utils.dateparse import parse_date

from core.date_ranges import local_day_bounds
from sales.models import Sale, SaleItem

logger = logging.getLogger(__name__)

ACTIVE_SALE_STATUSES = [Sale.Status.COMPLETED, Sale.Status.PARTIALLY_RETURNED]
SORT_FIELDS = {'quantity', 'revenue', 'profit'}


def _to_decimal(value):
    if value is None:
        return Decimal('0')
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return Decimal('0')


def _parse_limit(limit):
    try:
        return max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        return 10


def resolve_date_range(date_from_str, date_to_str):
    today = timezone.localdate()
    date_from = parse_date(date_from_str) if date_from_str else today.replace(day=1)
    date_to = parse_date(date_to_str) if date_to_str else today
    if not date_from or not date_to:
        raise ValueError('صيغة التاريخ غير صحيحة.')
    if date_from > date_to:
        raise ValueError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.')
    start, _ = local_day_bounds(date_from)
    _, end = local_day_bounds(date_to)
    return date_from, date_to, start, end


def compute_product_stats(store, date_from, date_to, start, end, sort='quantity', limit=10):
    if sort not in SORT_FIELDS:
        sort = 'quantity'
    limit = _parse_limit(limit)

    rows_data = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
        sale__created_at__gte=start,
        sale__created_at__lt=end,
    ).values_list(
        'product_id',
        'product_name',
        'quantity',
        'quantity_returned',
        'unit_price',
        'cost_price',
        'discount',
        'sale__exchange_rate_to_base',
    )

    buckets = defaultdict(lambda: {
        'name': '',
        'product_id': None,
        'quantity_sold': 0,
        'revenue': Decimal('0'),
        'profit': Decimal('0'),
    })

    for row in rows_data:
        (
            product_id, product_name, quantity, quantity_returned,
            unit_price, cost_price, discount, exchange_rate,
        ) = row
        sold = int(quantity or 0) - int(quantity_returned or 0)
        if sold <= 0:
            continue

        qty = int(quantity or 0)
        rate = _to_decimal(exchange_rate) or Decimal('1')
        unit_discount = _to_decimal(discount) / qty if qty else Decimal('0')
        unit_revenue = _to_decimal(unit_price) - unit_discount
        unit_revenue_base = unit_revenue * rate
        cost = _to_decimal(cost_price)
        revenue = unit_revenue_base * sold
        profit = (unit_revenue_base - cost) * sold

        key = product_id if product_id is not None else (product_name or '—')
        row = buckets[key]
        row['name'] = product_name or '—'
        row['product_id'] = product_id
        row['quantity_sold'] += sold
        row['revenue'] += revenue
        row['profit'] += profit

    rows = list(buckets.values())
    sort_key = {
        'quantity': 'quantity_sold',
        'revenue': 'revenue',
        'profit': 'profit',
    }[sort]
    rows.sort(key=lambda r: r[sort_key], reverse=True)
    top = rows[:limit]

    total_qty = sum(r['quantity_sold'] for r in rows)
    total_revenue = sum((r['revenue'] for r in rows), Decimal('0'))
    total_profit = sum((r['profit'] for r in rows), Decimal('0'))

    def serialize_row(r):
        revenue = r['revenue']
        margin = (r['profit'] / revenue * 100) if revenue > 0 else Decimal('0')
        return {
            'product_id': r['product_id'],
            'name': r['name'] or '—',
            'quantity_sold': r['quantity_sold'],
            'revenue': str(revenue.quantize(Decimal('0.01'))),
            'profit': str(r['profit'].quantize(Decimal('0.01'))),
            'margin_percent': str(margin.quantize(Decimal('0.1'))),
        }

    return {
        'date_from': date_from.isoformat(),
        'date_to': date_to.isoformat(),
        'sort': sort,
        'limit': limit,
        'summary': {
            'products_count': len(rows),
            'total_quantity_sold': total_qty,
            'total_revenue': str(total_revenue.quantize(Decimal('0.01'))),
            'total_profit': str(total_profit.quantize(Decimal('0.01'))),
        },
        'products': [serialize_row(r) for r in top],
    }
