from datetime import timedelta
from decimal import Decimal

from django import template
from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

register = template.Library()


def _money(val):
    try:
        return f'{Decimal(val):,.2f}'
    except Exception:
        return '0.00'


@register.simple_tag
def mobishop_dashboard_stats():
    """إحصائيات شاملة لصفحة رئيسية لوحة تحكم موبي شوب."""
    User = get_user_model()
    now = timezone.now()
    today = timezone.localdate()
    month_start = today.replace(day=1)
    week_ago = now - timedelta(days=7)

    stats = {
        'users': 0,
        'users_active': 0,
        'users_staff': 0,
        'stores': 0,
        'stores_active': 0,
        'stores_catalog': 0,
        'stores_app': 0,
        'products': 0,
        'products_low': 0,
        'products_catalog': 0,
        'customers': 0,
        'sales_today_count': 0,
        'sales_today_total': '0.00',
        'sales_month_count': 0,
        'sales_month_total': '0.00',
        'sales_week_count': 0,
        'repairs_open': 0,
        'subscriptions_trial': 0,
        'subscriptions_active': 0,
        'subscriptions_expired': 0,
        'apk_builds': 0,
        'apk_completed': 0,
        'marketplace_products': 0,
        'recent_sales': [],
        'top_stores': [],
    }

    try:
        stats['users'] = User.objects.count()
        stats['users_active'] = User.objects.filter(is_active=True).count()
        stats['users_staff'] = User.objects.filter(is_staff=True).count()
    except Exception:
        pass

    try:
        from stores.models import Store, Subscription

        stats['stores'] = Store.objects.count()
        stats['stores_active'] = Store.objects.filter(is_active=True).count()
        stats['stores_catalog'] = Store.objects.filter(catalog_enabled=True).count()
        stats['stores_app'] = Store.objects.filter(store_app_enabled=True).count()
        stats['subscriptions_trial'] = Subscription.objects.filter(
            status=Subscription.Status.TRIAL,
        ).count()
        stats['subscriptions_active'] = Subscription.objects.filter(
            status=Subscription.Status.ACTIVE,
        ).count()
        stats['subscriptions_expired'] = Subscription.objects.filter(
            status=Subscription.Status.EXPIRED,
        ).count()
    except Exception:
        pass

    try:
        from products.models import Product
        from django.db.models import F

        stats['products'] = Product.objects.filter(is_active=True).count()
        stats['products_catalog'] = Product.objects.filter(
            is_active=True, publish_in_catalog=True,
        ).count()
        stats['products_low'] = Product.objects.filter(
            is_active=True,
            quantity__gt=0,
            quantity__lte=F('low_stock_threshold'),
        ).count()
        stats['marketplace_products'] = stats['products_catalog']
    except Exception:
        pass

    try:
        from customers.models import Customer

        stats['customers'] = Customer.objects.filter(is_active=True).count()
    except Exception:
        pass

    try:
        from sales.models import Sale

        today_qs = Sale.objects.filter(created_at__date=today).exclude(status='cancelled')
        month_qs = Sale.objects.filter(created_at__date__gte=month_start).exclude(status='cancelled')
        week_qs = Sale.objects.filter(created_at__gte=week_ago).exclude(status='cancelled')

        stats['sales_today_count'] = today_qs.count()
        stats['sales_today_total'] = _money(
            today_qs.aggregate(t=Coalesce(Sum('total'), Decimal('0')))['t']
        )
        stats['sales_month_count'] = month_qs.count()
        stats['sales_month_total'] = _money(
            month_qs.aggregate(t=Coalesce(Sum('total'), Decimal('0')))['t']
        )
        stats['sales_week_count'] = week_qs.count()

        recent = (
            Sale.objects.select_related('store', 'customer')
            .exclude(status='cancelled')
            .order_by('-created_at')[:8]
        )
        stats['recent_sales'] = [
            {
                'id': s.id,
                'invoice': s.invoice_number,
                'store': s.store.name if s.store_id else '—',
                'customer': s.customer.name if s.customer_id else 'نقدي',
                'total': _money(s.total),
                'currency': s.currency or (s.store.currency if s.store_id else ''),
                'when': timezone.localtime(s.created_at).strftime('%Y-%m-%d %H:%M'),
            }
            for s in recent
        ]

        top = (
            Sale.objects.filter(created_at__date__gte=month_start)
            .exclude(status='cancelled')
            .values('store_id', 'store__name')
            .annotate(
                invoices=Count('id'),
                revenue=Coalesce(Sum('total'), Decimal('0')),
            )
            .order_by('-revenue')[:5]
        )
        stats['top_stores'] = [
            {
                'name': row['store__name'] or f"#{row['store_id']}",
                'invoices': row['invoices'],
                'revenue': _money(row['revenue']),
            }
            for row in top
        ]
    except Exception:
        pass

    try:
        from repairs.models import RepairOrder

        open_statuses = [
            RepairOrder.Status.RECEIVED,
            RepairOrder.Status.DIAGNOSING,
            RepairOrder.Status.WAITING_PARTS,
            RepairOrder.Status.IN_PROGRESS,
            RepairOrder.Status.READY,
        ]
        stats['repairs_open'] = RepairOrder.objects.filter(status__in=open_statuses).count()
    except Exception:
        try:
            from repairs.models import RepairOrder
            stats['repairs_open'] = RepairOrder.objects.exclude(
                status__in=['delivered', 'cancelled', 'completed'],
            ).count()
        except Exception:
            pass

    try:
        from store_app.models import StoreAppBuild

        stats['apk_builds'] = StoreAppBuild.objects.count()
        stats['apk_completed'] = StoreAppBuild.objects.filter(
            status=StoreAppBuild.Status.COMPLETED,
        ).count()
    except Exception:
        pass

    return stats


@register.simple_tag
def mobishop_brand_name():
    return 'موبي شوب'
