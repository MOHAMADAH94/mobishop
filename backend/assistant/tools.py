"""Controlled read-only store tools for the AI assistant.

Every function receives an already-authorized `store` instance from the view layer.
Never call these without HasStoreAccess + feature checks.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from core.product_stats import compute_product_stats
from customers.models import Customer
from intelligence.profit_service import compute_period_profit
from products.models import Product
from repairs.models import RepairOrder
from sales.models import Sale
from stores.currency_service import get_base_currency
from core.date_ranges import local_day_bounds


def get_store_summary(store) -> dict:
    currency = get_base_currency(store)
    today = compute_period_profit(store, 'today')
    month = compute_period_profit(store, 'month')
    low_stock = Product.objects.filter(
        store=store, is_active=True, quantity__lte=F('low_stock_threshold'),
    ).count()
    debt = Customer.objects.filter(store=store, is_active=True, debt__gt=0).aggregate(
        t=Sum('debt'),
    )['t'] or Decimal('0')
    open_repairs = RepairOrder.objects.filter(store=store).exclude(
        status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED],
    ).count()
    today_invoices = Sale.objects.filter(
        store=store, created_at__date=timezone.localdate(),
    ).exclude(status=Sale.Status.CANCELLED).count()
    return {
        'store_name': store.name,
        'currency': currency,
        'today_revenue': str(today['revenue']),
        'today_net_profit': str(today['net_profit']),
        'today_invoices': today_invoices,
        'month_revenue': str(month['revenue']),
        'month_net_profit': str(month['net_profit']),
        'low_stock_count': low_stock,
        'customer_debt_total': str(debt),
        'open_repairs': open_repairs,
    }


def get_today_sales(store) -> dict:
    today = compute_period_profit(store, 'today')
    start, end = local_day_bounds(timezone.localdate())
    invoices = Sale.objects.filter(
        store=store, created_at__gte=start, created_at__lt=end,
    ).exclude(status=Sale.Status.CANCELLED).count()
    return {
        'currency': get_base_currency(store),
        'revenue': str(today['revenue']),
        'net_profit': str(today['net_profit']),
        'expenses': str(today['expenses']),
        'invoice_count': invoices,
    }


def get_sales_summary(store, period: str = 'month') -> dict:
    data = compute_period_profit(store, period if period in ('today', 'week', 'month') else 'month')
    return {'period': period, 'currency': get_base_currency(store), **{k: str(v) for k, v in data.items()}}


def get_low_stock_products(store, limit: int = 15) -> list[dict]:
    rows = Product.objects.filter(
        store=store, is_active=True, quantity__lte=F('low_stock_threshold'),
    ).order_by('quantity').values('name', 'quantity', 'low_stock_threshold')[:limit]
    return list(rows)


def get_top_selling_products(store, limit: int = 5) -> list[dict]:
    today = timezone.localdate()
    start, _ = local_day_bounds(today.replace(day=1))
    _, end = local_day_bounds(today)
    data = compute_product_stats(store, today.replace(day=1), today, start, end, sort='quantity', limit=limit)
    return data.get('products', [])


def get_customer_debts(store, limit: int = 10) -> dict:
    customers = list(
        Customer.objects.filter(store=store, is_active=True, debt__gt=0)
        .order_by('-debt')[:limit]
        .values('name', 'phone', 'debt')
    )
    total = sum(Decimal(str(c['debt'])) for c in customers) if customers else Decimal('0')
    return {
        'currency': get_base_currency(store),
        'total': str(total),
        'customers': [
            {'name': c['name'], 'phone': c['phone'] or '', 'debt': str(c['debt'])}
            for c in customers
        ],
    }


def get_maintenance_summary(store) -> dict:
    qs = RepairOrder.objects.filter(store=store)
    open_qs = qs.exclude(status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED])
    today = timezone.localdate()
    late = open_qs.filter(estimated_delivery__lt=today).count()
    by_status = list(
        open_qs.values('status').annotate(c=Count('id')).order_by()
    )
    return {
        'open_count': open_qs.count(),
        'late_count': late,
        'by_status': {row['status']: row['c'] for row in by_status},
    }


def get_inventory_summary(store) -> dict:
    agg = Product.objects.filter(store=store, is_active=True).aggregate(
        total=Count('id'),
        out=Count('id', filter=Q(quantity=0)),
        low=Count('id', filter=Q(quantity__gt=0, quantity__lte=F('low_stock_threshold'))),
        in_stock=Count('id', filter=Q(quantity__gt=0)),
    )
    return {
        'active_products': agg['total'] or 0,
        'in_stock': agg['in_stock'] or 0,
        'out_of_stock': agg['out'] or 0,
        'low_stock': agg['low'] or 0,
    }


def get_expense_summary(store, period: str = 'month') -> dict:
    data = compute_period_profit(store, period if period in ('today', 'week', 'month') else 'month')
    return {
        'period': period,
        'currency': get_base_currency(store),
        'expenses': str(data['expenses']),
    }


def get_recent_invoices(store, limit: int = 5) -> list[dict]:
    sales = (
        Sale.objects.filter(store=store)
        .exclude(status=Sale.Status.CANCELLED)
        .order_by('-created_at')[:limit]
        .values('invoice_number', 'total', 'currency', 'payment_method', 'created_at')
    )
    return [
        {
            'invoice_number': s['invoice_number'],
            'total': str(s['total']),
            'currency': s['currency'],
            'payment_method': s['payment_method'],
            'created_at': s['created_at'].isoformat(),
        }
        for s in sales
    ]


def compare_month_sales(store) -> dict:
    today = timezone.localdate()
    this_month = compute_period_profit(store, 'month')
    # previous calendar month approx via week offset not perfect — use month period with date shift
    first = today.replace(day=1)
    prev_last = first - timedelta(days=1)
    prev = compute_period_profit(store, 'month', prev_last)
    return {
        'currency': get_base_currency(store),
        'this_month': {k: str(v) for k, v in this_month.items()},
        'last_month': {k: str(v) for k, v in prev.items()},
    }


TOOL_REGISTRY = {
    'get_store_summary': get_store_summary,
    'get_today_sales': get_today_sales,
    'get_sales_summary': get_sales_summary,
    'get_low_stock_products': get_low_stock_products,
    'get_top_selling_products': get_top_selling_products,
    'get_customer_debts': get_customer_debts,
    'get_maintenance_summary': get_maintenance_summary,
    'get_inventory_summary': get_inventory_summary,
    'get_expense_summary': get_expense_summary,
    'get_recent_invoices': get_recent_invoices,
    'compare_month_sales': compare_month_sales,
}


def run_tool(name: str, store, **kwargs):
    fn = TOOL_REGISTRY.get(name)
    if not fn:
        raise ValueError(f'Unknown tool: {name}')
    return fn(store, **kwargs) if kwargs else fn(store)
