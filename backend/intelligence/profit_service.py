"""خدمة تحليل الأرباح — حساب الربح الفعلي والتقسيمات."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from core.date_ranges import local_day_bounds
from core.product_stats import ACTIVE_SALE_STATUSES, compute_product_stats, resolve_date_range
from expenses.models import Expense
from products.models import Category, Product
from purchases.models import Purchase, PurchaseItem
from repairs.models import RepairOrder
from sales.models import Sale, SaleItem
from stores.currency_service import amount_in_base, get_base_currency
from stores.models import StoreMembership


def _to_decimal(value):
    if value is None:
        return Decimal('0')
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _sales_revenue(queryset):
    total = Decimal('0')
    for sale in queryset.only('total', 'total_returned', 'exchange_rate_to_base'):
        total += amount_in_base(sale.total - sale.total_returned, sale.exchange_rate_to_base)
    return total


def _sales_product_cost(queryset):
    cost = Decimal('0')
    for sale in queryset.prefetch_related('items'):
        for item in sale.items.all():
            sold = item.quantity - item.quantity_returned
            if sold > 0:
                cost += item.cost_price * sold
    return cost


def _sales_gross_profit(queryset):
    profit = Decimal('0')
    for sale in queryset.prefetch_related('items'):
        rate = sale.exchange_rate_to_base
        for item in sale.items.all():
            sold = item.quantity - item.quantity_returned
            if sold > 0:
                unit_price_base = amount_in_base(item.unit_price, rate)
                qty = int(item.quantity or 0)
                unit_discount = _to_decimal(item.discount) / qty if qty else Decimal('0')
                unit_revenue = unit_price_base - unit_discount
                profit += (unit_revenue - item.cost_price) * sold
    return profit


def _delivered_repairs(store, start, end):
    return RepairOrder.objects.filter(
        store=store,
        status=RepairOrder.Status.DELIVERED,
        completed_at__gte=start,
        completed_at__lt=end,
    )


def _repair_revenue(store, start, end):
    """إيراد الصيانة = إجمالي التذاكر المسلّمة فقط (الملغاة لا تُحسب)."""
    revenue = Decimal('0')
    for order in _delivered_repairs(store, start, end).only('total_cost', 'exchange_rate_to_base'):
        revenue += amount_in_base(order.total_cost, order.exchange_rate_to_base)
    return revenue


def _repair_parts_cost(store, start, end):
    """تكلفة القطع المحسوبة على التذاكر المسلّمة (بسعر الصرف)."""
    total = Decimal('0')
    for order in _delivered_repairs(store, start, end).only('parts_cost', 'exchange_rate_to_base'):
        total += amount_in_base(order.parts_cost, order.exchange_rate_to_base)
    return total


def _repair_labor_profit(store, start, end):
    total = Decimal('0')
    for order in _delivered_repairs(store, start, end).only('labor_cost', 'exchange_rate_to_base'):
        total += amount_in_base(order.labor_cost, order.exchange_rate_to_base)
    return total

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


def period_bounds(period: str, ref_date: date | None = None):
    """today | week | month | year → (start_dt, end_dt, start_date, end_date)."""
    today = ref_date or timezone.localdate()
    if period == 'today':
        start_dt, end_dt = local_day_bounds(today)
        return start_dt, end_dt, today, today
    if period == 'week':
        week_start = today - timedelta(days=today.weekday())
        start_dt, _ = local_day_bounds(week_start)
        _, end_dt = local_day_bounds(today)
        return start_dt, end_dt, week_start, today
    if period == 'year':
        year_start = today.replace(month=1, day=1)
        start_dt, _ = local_day_bounds(year_start)
        _, end_dt = local_day_bounds(today)
        return start_dt, end_dt, year_start, today
    # month (default)
    month_start = today.replace(day=1)
    start_dt, _ = local_day_bounds(month_start)
    _, end_dt = local_day_bounds(today)
    return start_dt, end_dt, month_start, today


def compute_period_profit(store, period='month', ref_date=None):
    start_dt, end_dt, start_date, end_date = period_bounds(period, ref_date)

    sales_qs = Sale.objects.filter(
        store=store,
        status__in=ACTIVE_SALE_STATUSES,
        created_at__gte=start_dt,
        created_at__lt=end_dt,
    )

    product_revenue = _sales_revenue(sales_qs)
    product_cost = _sales_product_cost(sales_qs)
    product_gross = _sales_gross_profit(sales_qs)

    repair_revenue = _repair_revenue(store, start_dt, end_dt)
    repair_parts = _repair_parts_cost(store, start_dt, end_dt)
    repair_labor = _repair_labor_profit(store, start_dt, end_dt)
    # الربح = الإيراد − تكلفة القطع (أجرة اليد صافي بعد خصم القطع)
    repair_gross = repair_revenue - repair_parts

    revenue = product_revenue + repair_revenue
    total_cost = product_cost + repair_parts
    gross_profit = product_gross + repair_gross
    expenses = _expenses_for_period(store, start_date, end_date)
    net_profit = gross_profit - expenses
    return {
        'period': period,
        'date_from': start_date.isoformat(),
        'date_to': end_date.isoformat(),
        'revenue': str(revenue.quantize(Decimal('0.01'))),
        'product_cost': str(total_cost.quantize(Decimal('0.01'))),
        'gross_profit': str(gross_profit.quantize(Decimal('0.01'))),
        'expenses': str(expenses.quantize(Decimal('0.01'))),
        'net_profit': str(net_profit.quantize(Decimal('0.01'))),
        'breakdown': {
            'products': {
                'revenue': str(product_revenue.quantize(Decimal('0.01'))),
                'cost': str(product_cost.quantize(Decimal('0.01'))),
                'profit': str(product_gross.quantize(Decimal('0.01'))),
            },
            'repairs': {
                'revenue': str(repair_revenue.quantize(Decimal('0.01'))),
                'parts_cost': str(repair_parts.quantize(Decimal('0.01'))),
                'labor_profit': str(repair_labor.quantize(Decimal('0.01'))),
                'profit': str(repair_gross.quantize(Decimal('0.01'))),
            },
        },
    }


def compute_dashboard_metrics(store):
    return {
        'base_currency': get_base_currency(store),
        'today': compute_period_profit(store, 'today'),
        'week': compute_period_profit(store, 'week'),
        'month': compute_period_profit(store, 'month'),
        'year': compute_period_profit(store, 'year'),
    }


def _category_segment(category_name: str) -> str:
    """تصنيف المنتج إلى: devices | accessories | other."""
    if not category_name:
        return 'other'
    name = category_name.lower()
    device_kw = ('موبايل', 'جوال', 'هاتف', 'mobile', 'phone', 'device', 'tablet', 'تاب')
    acc_kw = ('إكسسوار', 'اكسسوار', 'accessory', 'cover', 'case', 'charger', 'شاحن', 'سماع')
    if any(k in name for k in device_kw):
        return 'devices'
    if any(k in name for k in acc_kw):
        return 'accessories'
    return 'other'


def compute_profit_breakdown(store, period='month', ref_date=None):
    start_dt, end_dt, start_date, end_date = period_bounds(period, ref_date)

    segments = {
        'devices': {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0')},
        'accessories': {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0')},
        'other': {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0')},
        'repairs': {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0')},
        'services': {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0')},
    }

    product_categories = {
        p.id: (p.category.name if p.category_id else '')
        for p in Product.objects.filter(store=store).select_related('category')
    }

    rows = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
        sale__created_at__gte=start_dt,
        sale__created_at__lt=end_dt,
    ).values_list(
        'product_id', 'quantity', 'quantity_returned', 'unit_price', 'cost_price',
        'discount', 'sale__exchange_rate_to_base',
    )

    for product_id, qty, returned, unit_price, cost_price, discount, rate in rows:
        sold = int(qty or 0) - int(returned or 0)
        if sold <= 0:
            continue
        rate = _to_decimal(rate) or Decimal('1')
        unit_discount = _to_decimal(discount) / int(qty or 1)
        unit_revenue = (_to_decimal(unit_price) - unit_discount) * rate
        cost = _to_decimal(cost_price)
        revenue = unit_revenue * sold
        profit = (unit_revenue - cost) * sold
        cat_name = product_categories.get(product_id, '')
        seg = _category_segment(cat_name)
        segments[seg]['revenue'] += revenue
        segments[seg]['cost'] += cost * sold
        segments[seg]['profit'] += profit

    repair_rev = _repair_revenue(store, start_dt, end_dt)
    repair_parts = _repair_parts_cost(store, start_dt, end_dt)
    repair_labor = _repair_labor_profit(store, start_dt, end_dt)
    segments['repairs']['revenue'] = repair_rev
    segments['repairs']['cost'] = repair_parts
    segments['repairs']['profit'] = repair_rev - repair_parts
    segments['services']['revenue'] = repair_labor
    segments['services']['profit'] = repair_labor
    labels = {
        'devices': 'الأجهزة',
        'accessories': 'الإكسسوارات',
        'other': 'منتجات أخرى',
        'repairs': 'الصيانة',
        'services': 'الخدمات',
    }

    return {
        'period': period,
        'date_from': start_date.isoformat(),
        'date_to': end_date.isoformat(),
        'segments': [
            {
                'key': key,
                'label': labels[key],
                'revenue': str(v['revenue'].quantize(Decimal('0.01'))),
                'cost': str(v['cost'].quantize(Decimal('0.01'))),
                'profit': str(v['profit'].quantize(Decimal('0.01'))),
            }
            for key, v in segments.items()
            if v['revenue'] > 0 or v['profit'] > 0
        ],
    }


def compute_product_profitability(store, date_from_str=None, date_to_str=None, limit=50):
    today = timezone.localdate()
    date_from, date_to, start, end = resolve_date_range(
        date_from_str or today.replace(day=1).isoformat(),
        date_to_str or today.isoformat(),
    )
    stats = compute_product_stats(store, date_from, date_to, start, end, sort='profit', limit=limit)
    products = []
    for p in stats['products']:
        revenue = Decimal(p['revenue'])
        profit = Decimal(p['profit'])
        cost = revenue - profit
        margin = (profit / revenue * 100) if revenue > 0 else Decimal('0')
        products.append({
            **p,
            'cost': str(cost.quantize(Decimal('0.01'))),
            'gross_profit': p['profit'],
            'margin_percent': str(margin.quantize(Decimal('0.1'))),
        })
    return {
        'date_from': stats['date_from'],
        'date_to': stats['date_to'],
        'products': products,
        'summary': stats['summary'],
    }


def compute_category_profitability(store, date_from_str=None, date_to_str=None):
    today = timezone.localdate()
    date_from, date_to, start, end = resolve_date_range(
        date_from_str or today.replace(day=1).isoformat(),
        date_to_str or today.isoformat(),
    )

    buckets = defaultdict(lambda: {'revenue': Decimal('0'), 'cost': Decimal('0'), 'profit': Decimal('0'), 'name': '—'})

    rows = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
        sale__created_at__gte=start,
        sale__created_at__lt=end,
        product__isnull=False,
    ).select_related('product__category').values_list(
        'product__category_id', 'product__category__name',
        'quantity', 'quantity_returned', 'unit_price', 'cost_price', 'discount',
        'sale__exchange_rate_to_base',
    )

    for cat_id, cat_name, qty, returned, unit_price, cost_price, discount, rate in rows:
        sold = int(qty or 0) - int(returned or 0)
        if sold <= 0:
            continue
        rate = _to_decimal(rate) or Decimal('1')
        unit_discount = _to_decimal(discount) / int(qty or 1)
        unit_revenue = (_to_decimal(unit_price) - unit_discount) * rate
        cost = _to_decimal(cost_price)
        key = cat_id or 0
        buckets[key]['name'] = cat_name or 'بدون تصنيف'
        buckets[key]['revenue'] += unit_revenue * sold
        buckets[key]['cost'] += cost * sold
        buckets[key]['profit'] += (unit_revenue - cost) * sold

    categories = []
    for cat_id, data in sorted(buckets.items(), key=lambda x: x[1]['profit'], reverse=True):
        revenue = data['revenue']
        margin = (data['profit'] / revenue * 100) if revenue > 0 else Decimal('0')
        categories.append({
            'category_id': cat_id or None,
            'name': data['name'],
            'revenue': str(revenue.quantize(Decimal('0.01'))),
            'cost': str(data['cost'].quantize(Decimal('0.01'))),
            'profit': str(data['profit'].quantize(Decimal('0.01'))),
            'margin_percent': str(margin.quantize(Decimal('0.1'))),
        })

    return {'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(), 'categories': categories}


def compute_employee_profitability(store, date_from_str=None, date_to_str=None):
    today = timezone.localdate()
    date_from, date_to, start, end = resolve_date_range(
        date_from_str or today.replace(day=1).isoformat(),
        date_to_str or today.isoformat(),
    )

    buckets = defaultdict(lambda: {'revenue': Decimal('0'), 'profit': Decimal('0'), 'sales_count': 0, 'name': ''})

    sales = Sale.objects.filter(
        store=store,
        status__in=ACTIVE_SALE_STATUSES,
        created_at__gte=start,
        created_at__lt=end,
    ).select_related('created_by').prefetch_related('items')

    for sale in sales:
        user = sale.created_by
        key = user.id if user else 0
        buckets[key]['name'] = (user.get_full_name() or user.username) if user else 'غير محدد'
        buckets[key]['sales_count'] += 1
        rate = sale.exchange_rate_to_base
        for item in sale.items.all():
            sold = item.quantity - item.quantity_returned
            if sold <= 0:
                continue
            qty = int(item.quantity or 0)
            unit_discount = _to_decimal(item.discount) / qty if qty else Decimal('0')
            unit_revenue = amount_in_base(item.unit_price, rate) - unit_discount
            revenue = unit_revenue * sold
            profit = (unit_revenue - item.cost_price) * sold
            buckets[key]['revenue'] += revenue
            buckets[key]['profit'] += profit

    employees = []
    for user_id, data in sorted(buckets.items(), key=lambda x: x[1]['profit'], reverse=True):
        revenue = data['revenue']
        margin = (data['profit'] / revenue * 100) if revenue > 0 else Decimal('0')
        employees.append({
            'user_id': user_id or None,
            'name': data['name'],
            'sales_count': data['sales_count'],
            'revenue': str(revenue.quantize(Decimal('0.01'))),
            'profit': str(data['profit'].quantize(Decimal('0.01'))),
            'margin_percent': str(margin.quantize(Decimal('0.1'))),
        })

    return {'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(), 'employees': employees}


def compute_supplier_profitability(store, date_from_str=None, date_to_str=None):
    today = timezone.localdate()
    date_from, date_to, start, end = resolve_date_range(
        date_from_str or today.replace(day=1).isoformat(),
        date_to_str or today.isoformat(),
    )

    purchase_by_supplier = defaultdict(lambda: {'purchase_total': Decimal('0'), 'name': '', 'items_count': 0})
    for item in PurchaseItem.objects.filter(
        purchase__store=store,
        purchase__status=Purchase.Status.COMPLETED,
        purchase__created_at__gte=start,
        purchase__created_at__lt=end,
    ).select_related('purchase__supplier'):
        supplier = item.purchase.supplier
        key = supplier.id if supplier else 0
        purchase_by_supplier[key]['name'] = supplier.name if supplier else 'بدون مورد'
        rate = item.purchase.exchange_rate_to_base
        purchase_by_supplier[key]['purchase_total'] += amount_in_base(item.line_total, rate)
        purchase_by_supplier[key]['items_count'] += item.quantity

    # ربط المنتجات المشتراة بأرباح البيع
    product_purchase_cost = defaultdict(lambda: {'total_cost': Decimal('0'), 'qty': 0, 'supplier_id': None})
    for item in PurchaseItem.objects.filter(
        purchase__store=store,
        purchase__status=Purchase.Status.COMPLETED,
        product__isnull=False,
    ).select_related('purchase__supplier'):
        pid = item.product_id
        rate = item.purchase.exchange_rate_to_base
        product_purchase_cost[pid]['total_cost'] += amount_in_base(item.line_total, rate)
        product_purchase_cost[pid]['qty'] += item.quantity
        if item.purchase.supplier_id:
            product_purchase_cost[pid]['supplier_id'] = item.purchase.supplier_id

    supplier_sales_profit = defaultdict(lambda: Decimal('0'))
    sale_rows = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
        sale__created_at__gte=start,
        sale__created_at__lt=end,
        product__isnull=False,
    ).values_list(
        'product_id', 'quantity', 'quantity_returned', 'unit_price', 'cost_price',
        'discount', 'sale__exchange_rate_to_base',
    )
    for product_id, qty, returned, unit_price, cost_price, discount, rate in sale_rows:
        sold = int(qty or 0) - int(returned or 0)
        if sold <= 0:
            continue
        info = product_purchase_cost.get(product_id)
        if not info or not info['supplier_id']:
            continue
        rate = _to_decimal(rate) or Decimal('1')
        unit_discount = _to_decimal(discount) / int(qty or 1)
        unit_revenue = (_to_decimal(unit_price) - unit_discount) * rate
        profit = (unit_revenue - _to_decimal(cost_price)) * sold
        supplier_sales_profit[info['supplier_id']] += profit

    suppliers = []
    all_keys = set(purchase_by_supplier.keys()) | set(supplier_sales_profit.keys())
    for sid in all_keys:
        if sid == 0:
            continue
        pdata = purchase_by_supplier.get(sid, {'purchase_total': Decimal('0'), 'name': '', 'items_count': 0})
        sales_profit = supplier_sales_profit.get(sid, Decimal('0'))
        purchase_total = pdata['purchase_total']
        avg_unit = (purchase_total / pdata['items_count']) if pdata['items_count'] else Decimal('0')
        suppliers.append({
            'supplier_id': sid,
            'name': pdata['name'] or '—',
            'purchase_total': str(purchase_total.quantize(Decimal('0.01'))),
            'items_purchased': pdata['items_count'],
            'avg_unit_cost': str(avg_unit.quantize(Decimal('0.01'))),
            'related_sales_profit': str(sales_profit.quantize(Decimal('0.01'))),
        })

    suppliers.sort(key=lambda x: Decimal(x['related_sales_profit']), reverse=True)
    return {'date_from': date_from.isoformat(), 'date_to': date_to.isoformat(), 'suppliers': suppliers}


def compute_profit_trends(store, days=30):
    today = timezone.localdate()
    trends = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        data = compute_period_profit(store, 'today', day)
        trends.append({
            'date': day.isoformat(),
            'revenue': data['revenue'],
            'gross_profit': data['gross_profit'],
            'expenses': data['expenses'],
            'net_profit': data['net_profit'],
        })
    return {'days': days, 'trends': trends}
