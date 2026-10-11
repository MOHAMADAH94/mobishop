from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.date_ranges import (
    local_day_bounds,
    month_period_bounds,
    parse_dashboard_day,
    parse_dashboard_month,
)
from core.permissions import HasPermission, HasStoreAccess
from core.product_stats import compute_product_stats, resolve_date_range
from expenses.models import Expense
from products.models import Product
from repairs.models import RepairOrder
from sales.models import Sale, SaleItem
from stores.currency_service import amount_in_base, get_base_currency


def _sales_profit(queryset):
    profit = Decimal('0')
    for sale in queryset.prefetch_related('items'):
        rate = sale.exchange_rate_to_base
        for item in sale.items.all():
            sold = item.quantity - item.quantity_returned
            if sold > 0:
                unit_price_base = amount_in_base(item.unit_price, rate)
                profit += (unit_price_base - item.cost_price) * sold
    return profit


def _sale_net_in_base(sale):
    return amount_in_base(sale.total - sale.total_returned, sale.exchange_rate_to_base)


def _repair_labor_profit(store, start, end):
    return RepairOrder.objects.filter(
        store=store,
        status=RepairOrder.Status.DELIVERED,
        completed_at__gte=start,
        completed_at__lt=end,
    ).aggregate(t=Sum('labor_cost'))['t'] or Decimal('0')


def _repair_revenue_for_period(store, start, end):
    """Cash-basis repair revenue in base currency."""
    deposits = Decimal('0')
    for order in RepairOrder.objects.filter(
        store=store,
        received_at__gte=start,
        received_at__lt=end,
    ).only('deposit_paid', 'exchange_rate_to_base'):
        deposits += amount_in_base(order.deposit_paid, order.exchange_rate_to_base)

    delivery_balance = Decimal('0')
    for order in RepairOrder.objects.filter(
        store=store,
        status=RepairOrder.Status.DELIVERED,
        completed_at__gte=start,
        completed_at__lt=end,
    ).only('total_cost', 'deposit_paid', 'exchange_rate_to_base'):
        delivery_balance += amount_in_base(
            order.total_cost - order.deposit_paid, order.exchange_rate_to_base,
        )

    return deposits + delivery_balance


def _expenses_for_period(store, start_date, end_date):
    total = Decimal('0')
    for expense in Expense.objects.filter(
        store=store,
        is_active=True,
        expense_date__gte=start_date,
        expense_date__lte=end_date,
    ).only('amount', 'exchange_rate_to_base'):
        total += amount_in_base(expense.amount, expense.exchange_rate_to_base)
    return total


class DashboardStatsView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('dashboard')]

    def get(self, request):
        from core.store_context import ensure_store_context
        store = ensure_store_context(request)
        if not store:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('يجب اختيار متجر أولاً.')

        today = timezone.localdate()
        try:
            selected_day = parse_dashboard_day(request.query_params.get('day'), today)
            month_first = parse_dashboard_month(
                request.query_params.get('month'),
                selected_day,
            )
        except (ValueError, TypeError) as exc:
            raise ValidationError(str(exc)) from exc

        day_start, day_end = local_day_bounds(selected_day)
        month_start, month_end = month_period_bounds(month_first, today)
        chart_last_day = month_end.date() - timedelta(days=1)
        if month_first.year == today.year and month_first.month == today.month:
            chart_last_day = min(chart_last_day, today)

        active_sale_statuses = [Sale.Status.COMPLETED, Sale.Status.PARTIALLY_RETURNED]

        sales_today_base = Sale.objects.filter(
            store=store,
            status__in=active_sale_statuses,
            created_at__gte=day_start,
            created_at__lt=day_end,
        )
        sales_month_base = Sale.objects.filter(
            store=store,
            status__in=active_sale_statuses,
            created_at__gte=month_start,
            created_at__lt=month_end,
        )

        today_sales_net = Decimal('0')
        for sale in sales_today_base.only('total', 'total_returned', 'exchange_rate_to_base'):
            today_sales_net += _sale_net_in_base(sale)
        month_sales_net = Decimal('0')
        for sale in sales_month_base.only('total', 'total_returned', 'exchange_rate_to_base'):
            month_sales_net += _sale_net_in_base(sale)

        month_profit = _sales_profit(sales_month_base) + _repair_labor_profit(
            store, month_start, month_end,
        )
        today_profit = _sales_profit(sales_today_base) + _repair_labor_profit(
            store, day_start, day_end,
        )

        month_start_date = month_start.date()
        month_end_date = month_end.date() - timedelta(days=1)
        today_expenses = _expenses_for_period(store, selected_day, selected_day)
        month_expenses = _expenses_for_period(store, month_start_date, month_end_date)
        today_net_profit = today_profit - today_expenses
        month_net_profit = month_profit - month_expenses

        repairs_open = RepairOrder.objects.filter(store=store).exclude(
            status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED],
        )

        today_repairs = _repair_revenue_for_period(store, day_start, day_end)
        month_repairs = _repair_revenue_for_period(store, month_start, month_end)
        month_deposits = Decimal('0')
        for order in RepairOrder.objects.filter(
            store=store,
            received_at__gte=month_start,
            received_at__lt=month_end,
        ).only('deposit_paid', 'exchange_rate_to_base'):
            month_deposits += amount_in_base(order.deposit_paid, order.exchange_rate_to_base)
        open_repairs_value = Decimal('0')
        for order in repairs_open.only('total_cost', 'exchange_rate_to_base'):
            open_repairs_value += amount_in_base(order.total_cost, order.exchange_rate_to_base)
        open_repairs_count = repairs_open.count()

        total_customer_debt = store.customers.filter(is_active=True).aggregate(
            t=Sum('debt'),
        )['t'] or Decimal('0')

        low_stock = Product.objects.filter(
            store=store, is_active=True, quantity__lte=F('low_stock_threshold'),
        ).count()

        inv_agg = Product.objects.filter(store=store, is_active=True).aggregate(
            inventory_cost_value=Coalesce(
                Sum(F('buy_price') * F('quantity'), output_field=DecimalField()),
                Decimal('0'),
            ),
            inventory_sell_value=Coalesce(
                Sum(F('sell_price') * F('quantity'), output_field=DecimalField()),
                Decimal('0'),
            ),
            total_products=Count('id'),
        )
        inventory_cost_value = inv_agg['inventory_cost_value']
        inventory_sell_value = inv_agg['inventory_sell_value']
        total_products = inv_agg['total_products']

        top_products = (
            SaleItem.objects.filter(
                sale__store=store,
                sale__status__in=active_sale_statuses,
                sale__created_at__gte=month_start,
                sale__created_at__lt=month_end,
            )
            .values('product_name')
            .annotate(qty=Sum(F('quantity') - F('quantity_returned')))
            .order_by('-qty')[:5]
        )

        chart_start = local_day_bounds(month_first)[0]
        sales_by_day = defaultdict(lambda: {'sales_total': Decimal('0'), 'count': 0})
        for sale in Sale.objects.filter(
            store=store,
            status__in=active_sale_statuses,
            created_at__gte=chart_start,
            created_at__lt=month_end,
        ).only('created_at', 'total', 'total_returned', 'exchange_rate_to_base'):
            day = timezone.localtime(sale.created_at).date()
            sales_by_day[day]['sales_total'] += _sale_net_in_base(sale)
            sales_by_day[day]['count'] += 1

        repairs_by_day = defaultdict(lambda: Decimal('0'))
        for order in RepairOrder.objects.filter(
            store=store,
            received_at__gte=chart_start,
            received_at__lt=month_end,
        ).only('received_at', 'deposit_paid', 'exchange_rate_to_base'):
            day = timezone.localtime(order.received_at).date()
            repairs_by_day[day] += amount_in_base(order.deposit_paid, order.exchange_rate_to_base)

        for order in RepairOrder.objects.filter(
            store=store,
            status=RepairOrder.Status.DELIVERED,
            completed_at__gte=chart_start,
            completed_at__lt=month_end,
        ).only('completed_at', 'total_cost', 'deposit_paid', 'exchange_rate_to_base'):
            day = timezone.localtime(order.completed_at).date()
            repairs_by_day[day] += amount_in_base(
                order.total_cost - order.deposit_paid, order.exchange_rate_to_base,
            )

        expenses_by_day = defaultdict(lambda: Decimal('0'))
        for expense in Expense.objects.filter(
            store=store,
            is_active=True,
            expense_date__gte=month_first,
            expense_date__lte=chart_last_day,
        ).only('expense_date', 'amount', 'exchange_rate_to_base'):
            expenses_by_day[expense.expense_date] += amount_in_base(
                expense.amount, expense.exchange_rate_to_base,
            )

        daily_combined = []
        cursor = month_first
        while cursor <= chart_last_day:
            sales_val = sales_by_day[cursor]['sales_total']
            repairs_val = repairs_by_day[cursor]
            expenses_val = expenses_by_day[cursor]
            daily_combined.append({
                'date': cursor.isoformat(),
                'sales_total': str(sales_val),
                'repairs_total': str(repairs_val),
                'expenses_total': str(expenses_val),
                'total': str(sales_val + repairs_val),
                'count': sales_by_day[cursor]['count'],
            })
            cursor += timedelta(days=1)

        return Response({
            'base_currency': get_base_currency(store),
            'selected_day': selected_day.isoformat(),
            'selected_month': month_first.strftime('%Y-%m'),
            'today_sales': str(today_sales_net),
            'month_sales': str(month_sales_net),
            'today_repairs': str(today_repairs),
            'month_repairs': str(month_repairs),
            'month_deposits': str(month_deposits),
            'today_total': str(today_sales_net + today_repairs),
            'month_total': str(month_sales_net + month_repairs),
            'today_profit': str(today_profit),
            'month_profit': str(month_profit),
            'today_expenses': str(today_expenses),
            'month_expenses': str(month_expenses),
            'today_net_profit': str(today_net_profit),
            'month_net_profit': str(month_net_profit),
            'total_customer_debt': str(total_customer_debt),
            'open_repairs_count': open_repairs_count,
            'open_repairs_value': str(open_repairs_value),
            'today_invoices': sales_today_base.count(),
            'month_invoices': sales_month_base.count(),
            'low_stock_count': low_stock,
            'total_products': total_products,
            'inventory_cost_value': str(inventory_cost_value),
            'inventory_sell_value': str(inventory_sell_value),
            'top_products': [
                {'name': p['product_name'] or '—', 'quantity': max(0, p['qty'] or 0)}
                for p in top_products
                if p['product_name']
            ],
            'daily_sales': daily_combined,
        })


class ProductStatsView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('dashboard')]

    def get(self, request):
        from core.store_context import ensure_store_context
        from rest_framework.exceptions import ValidationError

        store = ensure_store_context(request)
        if not store:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('يجب اختيار متجر أولاً.')

        try:
            date_from, date_to, start, end = resolve_date_range(
                request.query_params.get('date_from'),
                request.query_params.get('date_to'),
            )
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        sort = request.query_params.get('sort', 'quantity')
        limit = request.query_params.get('limit', '10')

        try:
            data = compute_product_stats(
                store, date_from, date_to, start, end, sort=sort, limit=limit,
            )
        except Exception:
            import logging
            logging.getLogger(__name__).exception('product_stats failed store=%s', store.id)
            raise

        return Response(data)
