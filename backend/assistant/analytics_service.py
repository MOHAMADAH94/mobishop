"""خدمة التحليلات الداخلية — تجيب على أسئلة الأعمال قبل/بدون AI."""

import re
from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, ExpressionWrapper, F, Q, Sum
from django.utils import timezone

from core.date_ranges import local_day_bounds
from core.product_stats import compute_product_stats
from customers.models import Customer
from intelligence.profit_service import (
    compute_dashboard_metrics,
    compute_period_profit,
    compute_product_profitability,
    compute_profit_breakdown,
    compute_supplier_profitability,
)
from intelligence.sales_metrics import bulk_product_sales_metrics
from products.models import Product
from repairs.models import RepairOrder
from stores.currency_service import get_base_currency


SUGGESTED_QUESTIONS = [
    'ما المنتجات التي يجب إعادة طلبها؟',
    'ما المنتجات التي ستنفد مخزونها قريباً؟',
    'ما المنتجات الراكدة حالياً؟',
    'ما المنتجات ذات هامش ربح منخفض؟',
    'ما هو أكثر منتج ربحاً؟',
    'ما هي أقل المنتجات مبيعاً؟',
    'ما أكثر المنتجات مبيعاً هذا الشهر؟',
    'لماذا انخفضت الأرباح هذا الأسبوع؟',
    'كم صافي ربح الشهر الحالي؟',
    'هل المصاريف مرتفعة هذا الأسبوع؟',
    'أي مورد يقدم أفضل الأسعار؟',
    'ما العملاء الذين لديهم ديون مستحقة؟',
    'ما أوامر الصيانة المتأخرة؟',
    'ما هي insights اليوم؟',
]

STALE_DAYS = 30
STOCKOUT_DAYS = 14
MIN_MARGIN_PERCENT = Decimal('10')


class _AnalyticsContext:
    """ذاكرة مؤقتة لطلب واحد — تقلّل الاستعلامات المكررة."""

    __slots__ = ('store', 'today', 'currency', '_week', '_month', '_prev_week', '_bulk')

    def __init__(self, store):
        self.store = store
        self.today = timezone.localdate()
        self.currency = get_base_currency(store)
        self._week = None
        self._month = None
        self._prev_week = None
        self._bulk = None

    def week_profit(self):
        if self._week is None:
            self._week = compute_period_profit(self.store, 'week')
        return self._week

    def month_profit(self):
        if self._month is None:
            self._month = compute_period_profit(self.store, 'month')
        return self._month

    def prev_week_profit(self):
        if self._prev_week is None:
            self._prev_week = compute_period_profit(
                self.store, 'week', self.today - timedelta(days=7),
            )
        return self._prev_week

    def bulk_sales(self):
        if self._bulk is None:
            product_ids = list(
                Product.objects.filter(
                    store=self.store, is_active=True, quantity__gt=0,
                ).values_list('id', flat=True),
            )
            self._bulk = bulk_product_sales_metrics(self.store, product_ids)
        return self._bulk


# أنماط لكل نية — تُفحص بالترتيب (الأكثر تحديداً أولاً)
INTENT_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ('today_insights', (
        r'insights\s*اليوم', r'insights\s*today', r'رؤى\s*اليوم', r'ملخص\s*اليوم',
        r'^ما\s+هي\s+insights',
    )),
    ('stockout_soon', (
        r'ستنفد\s+.*مخز', r'نفاد\s+.*مخز', r'ينفد\s+.*قريب', r'stock\s*out',
    )),
    ('customer_debt', (
        r'ديون\s+.*(?:عميل|عملاء|مستحق)', r'عملاء\s+.*(?:دين|ديون)', r'customer\s+debt',
    )),
    ('late_repairs', (
        r'صيان[ةه]\s+.*(?:متأخر|متأخرة)', r'أوامر\s+.*صيان', r'late\s+repair',
    )),
    ('low_margin', (
        r'هامش\s+.*(?:ربح|منخفض)', r'ربح\s+.*منخفض', r'low\s+margin',
    )),
    ('top_selling', (
        r'أكثر\s+.*(?:مبيع|مبيعاً)', r'الأكثر\s+.*مبيع', r'top\s+selling', r'best\s+seller',
    )),
    ('month_profit', (
        r'صافي\s+.*ربح\s+.*(?:شهر|الشهر)', r'ربح\s+.*(?:شهر|الشهر)', r'month\s+profit',
    )),
    ('high_expenses', (
        r'مصاريف\s+.*(?:مرتفع|مرتفعة|كثير)', r'هل\s+.*مصاريف', r'high\s+expense',
    )),
    ('most_profitable', (r'أكثر\s+.*ربح', r'أفضل\s+.*ربح', r'most\s+profitable',)),
    ('least_selling', (r'أقل\s+.*مبيع', r'أضعف\s+.*مبيع', r'lowest\s+selling',)),
    ('reorder', (r'إعادة\s+.*طلب', r'يجب\s+.*(?:طلب|إعادة)', r'reorder', r'نفاد\s+.*مخز',)),
    ('profit_decrease', (
        r'لماذا\s+.*(?:ربح|أرباح)', r'انخفاض\s+.*(?:ربح|أرباح)',
        r'انخفض\s+.*(?:ربح|أرباح)', r'profit\s+.*decreas', r'سبب\s+.*(?:ربح|أرباح)',
    )),
    ('best_supplier', (
        r'مورد\s+.*(?:سعر|أسعار|أرخص|أفضل)', r'أ(?:ي|فضل)\s+.*مورد',
        r'أرخص\s+.*مورد', r'supplier\s+.*price', r'أفضل\s+.*(?:سعر|أسعار).*شراء',
    )),
    ('stale_products', (r'راكد', r'stagnant', r'لم\s+.*(?:يُبع|تباع)', r'بدون\s+.*مبيع',)),
]


def _normalize(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r'[^\w\s\u0600-\u06FF?؟]', ' ', text)
    return re.sub(r'\s+', ' ', text)


def _detect_intent(question: str) -> str | None:
    q = _normalize(question)
    for intent, patterns in INTENT_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, q):
                return intent
    return None


def _response(answer: str, statistics: dict, recommendation: str | None) -> dict:
    return {
        'answer': answer,
        'statistics': statistics,
        'recommendation': recommendation,
    }


def _answer_most_profitable(ctx):
    today = ctx.today
    currency = ctx.currency
    data = compute_product_profitability(
        ctx.store, today.replace(day=1).isoformat(), today.isoformat(), limit=5,
    )
    if not data['products']:
        return _response('لا توجد مبيعات في الفترة الحالية.', {}, None)
    top = data['products'][0]
    stats = (
        f"الإيرادات: {top['revenue']} {currency} | "
        f"الربح: {top['gross_profit']} {currency} | الهامش: {top['margin_percent']}%"
    )
    return _response(
        f"أكثر منتج ربحاً هو **{top['name']}** بربح {top['gross_profit']} {currency}.",
        {'top_products': data['products'][:5], 'stats': stats},
        f"استمر في توفير مخزون كافٍ لـ {top['name']}.",
    )


def _answer_least_selling(ctx):
    today = ctx.today
    start, _ = local_day_bounds(today.replace(day=1))
    _, end = local_day_bounds(today)
    data = compute_product_stats(ctx.store, today.replace(day=1), today, start, end, sort='quantity', limit=50)
    products = data.get('products', [])
    if not products:
        return _response('لا توجد مبيعات في الفترة الحالية.', {}, None)
    bottom = sorted(products, key=lambda p: p['quantity_sold'])[:5]
    names = ', '.join(f"{p['name']} ({p['quantity_sold']})" for p in bottom)
    return _response(
        f'أقل المنتجات مبيعاً هذا الشهر: {names}.',
        {'bottom_products': bottom},
        'فكّر في عروض ترويجية للمنتجات بطيئة الحركة.',
    )


def _answer_reorder(ctx):
    seen: set[int] = set()
    items = []
    for row in Product.objects.filter(
        store=ctx.store, is_active=True, quantity__lte=F('low_stock_threshold'),
    ).values('id', 'name', 'quantity', 'low_stock_threshold').order_by('quantity', 'name')[:20]:
        if row['id'] in seen:
            continue
        seen.add(row['id'])
        items.append(row)
        if len(items) >= 10:
            break
    if not items:
        return _response('جميع المنتجات فوق حد التنبيه حالياً.', {}, None)
    names = ', '.join(f"{p['name']} ({p['quantity']} متبقي)" for p in items)
    return _response(
        f'منتجات تحتاج إعادة طلب: {names}.',
        {'low_stock_products': items},
        'راجع الموردين واطلب الكميات المناسبة.',
    )


def _answer_profit_decrease(ctx):
    currency = ctx.currency
    this_week = ctx.week_profit()
    prev_week = ctx.prev_week_profit()
    current_net = Decimal(this_week['net_profit'])
    prev_net = Decimal(prev_week['net_profit'])
    current_rev = Decimal(this_week['revenue'])
    prev_rev = Decimal(prev_week['revenue'])
    current_exp = Decimal(this_week['expenses'])
    prev_exp = Decimal(prev_week['expenses'])

    lines = [
        f"**هذا الأسبوع:** صافي ربح {this_week['net_profit']} {currency} "
        f"(إيرادات {this_week['revenue']} − مصاريف {this_week['expenses']}).",
        f"**الأسبوع السابق:** صافي ربح {prev_week['net_profit']} {currency} "
        f"(إيرادات {prev_week['revenue']} − مصاريف {prev_week['expenses']}).",
    ]

    rec = None
    if prev_net > 0 and current_net < prev_net:
        drop = int((prev_net - current_net) / prev_net * 100)
        lines.insert(0, f"نعم، صافي الربح انخفض بنسبة {drop}% مقارنة بالأسبوع السابق.")
        reasons = []
        if current_rev < prev_rev:
            reasons.append(f"الإيرادات انخفضت ({prev_rev} ← {current_rev} {currency})")
        if current_exp > prev_exp:
            reasons.append(f"المصاريف ارتفعت ({prev_exp} ← {current_exp} {currency})")
        if reasons:
            lines.append('الأسباب المحتملة: ' + '؛ '.join(reasons) + '.')
        rec = 'راجع الفواتير والمصاريف الأخيرة وقارن المنتجات الأكثر مبيعاً.'
    elif current_net >= prev_net:
        lines.insert(0, 'صافي الربح هذا الأسبوع لم ينخفض مقارنة بالأسبوع السابق.')
        if current_net > prev_net:
            lines.append('بل ارتفع — أداء جيد هذا الأسبوع.')
    else:
        lines.insert(0, 'لا توجد بيانات كافية عن الأسبوع السابق للمقارنة.')

    return _response(
        '\n'.join(lines),
        {'this_week': this_week, 'prev_week': prev_week},
        rec,
    )


def _answer_best_supplier(ctx):
    currency = ctx.currency
    data = compute_supplier_profitability(ctx.store)
    suppliers = data.get('suppliers', [])
    if not suppliers:
        return _response(
            'لا توجد فواتير شراء مسجلة بعد — سجّل المشتريات لتحليل أسعار الموردين.',
            {},
            None,
        )
    with_purchases = [s for s in suppliers if Decimal(s['purchase_total']) > 0]
    if not with_purchases:
        return _response('لا توجد مشتريات كافية لمقارنة الموردين.', {}, None)
    by_cost = sorted(with_purchases, key=lambda s: Decimal(s['avg_unit_cost']))
    best = by_cost[0]
    comparison = ', '.join(
        f"{s['name']} ({s['avg_unit_cost']} {currency})"
        for s in by_cost[:3]
    )
    return _response(
        f"أقل متوسط سعر شراء: **{best['name']}** ({best['avg_unit_cost']} {currency}/وحدة).\n"
        f"المقارنة: {comparison}.",
        {'suppliers': by_cost[:5]},
        f"المورد **{best['name']}** يقدم أقل متوسط تكلفة — قارن الجودة قبل تغيير المورد.",
    )


def _answer_stale_products(ctx):
    today = ctx.today
    stale_cutoff = today - timedelta(days=STALE_DAYS)
    last_sale_map, _, _, _ = ctx.bulk_sales()
    stale = []
    for product in Product.objects.filter(
        store=ctx.store, is_active=True, quantity__gt=0,
    ).values('id', 'name', 'quantity', 'created_at')[:150]:
        last_at = last_sale_map.get(product['id'])
        if last_at is None:
            created = timezone.localtime(product['created_at']).date()
            if created <= stale_cutoff:
                stale.append({'name': product['name'], 'quantity': product['quantity'], 'days': STALE_DAYS})
        else:
            last = timezone.localtime(last_at).date()
            if last <= stale_cutoff:
                stale.append({
                    'name': product['name'],
                    'quantity': product['quantity'],
                    'days': (today - last).days,
                })
        if len(stale) >= 10:
            break
    if not stale:
        return _response('لا توجد منتجات راكدة حالياً.', {}, None)
    names = ', '.join(f"{s['name']} ({s['days']} يوم)" for s in stale[:5])
    return _response(
        f'منتجات راكدة: {names}.',
        {'stale_products': stale[:10]},
        'أنشئ عروضاً ترويجية أو خفّض الأسعار.',
    )


def _answer_stockout_soon(ctx):
    products = list(
        Product.objects.filter(store=ctx.store, is_active=True, quantity__gt=0)
        .values('id', 'name', 'quantity'),
    )
    if not products:
        return _response('لا توجد منتجات في المخزون.', {}, None)
    _, avg_daily_map, _, _ = ctx.bulk_sales()
    at_risk = []
    for product in products:
        avg_daily = avg_daily_map.get(product['id'], Decimal('0'))
        if avg_daily <= 0:
            continue
        days_left = Decimal(product['quantity']) / avg_daily
        if days_left <= STOCKOUT_DAYS:
            at_risk.append({
                'name': product['name'],
                'quantity': product['quantity'],
                'days_left': int(days_left),
            })
    at_risk.sort(key=lambda x: x['days_left'])
    if not at_risk:
        return _response('لا توجد منتجات معرضة لنفاد المخزون خلال 14 يوماً.', {}, None)
    names = ', '.join(f"{p['name']} ({p['days_left']} يوم)" for p in at_risk[:5])
    return _response(
        f'منتجات قد تنفد قريباً: {names}.',
        {'at_risk': at_risk[:10]},
        'أعد طلب هذه المنتجات قبل نفاد المخزون.',
    )


def _answer_customer_debt(ctx):
    currency = ctx.currency
    customers = list(
        Customer.objects.filter(store=ctx.store, is_active=True, debt__gt=0)
        .order_by('-debt')[:10]
        .values('name', 'phone', 'debt')
    )
    if not customers:
        return _response('لا توجد ديون مستحقة على العملاء حالياً.', {}, None)
    total = sum(Decimal(str(c['debt'])) for c in customers)
    lines = [f"• {c['name']} ({c['phone'] or '—'}): {c['debt']} {currency}" for c in customers[:5]]
    return _response(
        f'عملاء لديهم ديون ({len(customers)}):\n' + '\n'.join(lines),
        {'customers': customers, 'total_debt': str(total)},
        'تواصل مع العملاء المتأخرين في السداد.',
    )


def _answer_late_repairs(ctx):
    today = ctx.today
    orders = list(
        RepairOrder.objects.filter(
            store=ctx.store,
            estimated_delivery__lt=today,
        ).exclude(
            status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED],
        ).order_by('estimated_delivery')[:10]
        .values('ticket_number', 'customer_name', 'estimated_delivery', 'status')
    )
    if not orders:
        return _response('لا توجد أوامر صيانة متأخرة.', {}, None)
    lines = []
    for o in orders[:5]:
        days_late = (today - o['estimated_delivery']).days
        lines.append(f"• {o['ticket_number']} ({o['customer_name'] or '—'}): متأخر {days_late} يوم")
    return _response(
        f'أوامر صيانة متأخرة ({len(orders)}):\n' + '\n'.join(lines),
        {'orders': orders},
        'حدّث حالة الصيانة أو تواصل مع العملاء.',
    )


def _answer_low_margin(ctx):
    margin_expr = ExpressionWrapper(
        (F('sell_price') - F('buy_price')) * 100 / F('sell_price'),
        output_field=DecimalField(max_digits=8, decimal_places=2),
    )
    low = list(
        Product.objects.filter(
            store=ctx.store, is_active=True, sell_price__gt=0, buy_price__gt=0,
        ).annotate(margin=margin_expr)
        .filter(margin__lt=MIN_MARGIN_PERCENT)
        .order_by('margin')
        .values('name', 'buy_price', 'sell_price', 'margin')[:10],
    )
    if not low:
        return _response('جميع المنتجات ضمن هامش ربح مقبول.', {}, None)
    names = ', '.join(
        f"{p['name']} ({Decimal(str(p['margin'])).quantize(Decimal('0.1'))}%)"
        for p in low[:5]
    )
    return _response(
        f'منتجات بهامش ربح منخفض: {names}.',
        {'products': [
            {
                'name': p['name'],
                'margin': str(Decimal(str(p['margin'])).quantize(Decimal('0.1'))),
                'buy_price': str(p['buy_price']),
                'sell_price': str(p['sell_price']),
            }
            for p in low
        ]},
        'راجع أسعار البيع أو ابحث عن موردين بأسعار أفضل.',
    )


def _answer_top_selling(ctx):
    today = ctx.today
    start, _ = local_day_bounds(today.replace(day=1))
    _, end = local_day_bounds(today)
    data = compute_product_stats(ctx.store, today.replace(day=1), today, start, end, sort='quantity', limit=5)
    products = data.get('products', [])
    if not products:
        return _response('لا توجد مبيعات هذا الشهر.', {}, None)
    names = ', '.join(f"{p['name']} ({p['quantity_sold']})" for p in products)
    return _response(
        f'أكثر المنتجات مبيعاً هذا الشهر: {names}.',
        {'top_products': products},
        f'تأكد من توفر مخزون كافٍ لـ {products[0]["name"]}.',
    )


def _answer_month_profit(ctx):
    month = ctx.month_profit()
    currency = ctx.currency
    return _response(
        f"صافي ربح الشهر الحالي: **{month['net_profit']} {currency}**\n"
        f"• الإيرادات: {month['revenue']} {currency}\n"
        f"• إجمالي الربح: {month['gross_profit']} {currency}\n"
        f"• المصاريف: {month['expenses']} {currency}",
        {'month': month},
        None,
    )


def _answer_high_expenses(ctx):
    currency = ctx.currency
    week = ctx.week_profit()
    month = ctx.month_profit()
    week_exp = Decimal(week['expenses'])
    month_exp = Decimal(month['expenses'])
    if month_exp <= 0:
        return _response('لا توجد مصاريف مسجلة هذا الشهر.', {}, None)
    ratio = int(week_exp / month_exp * 100) if month_exp else 0
    if week_exp > month_exp * Decimal('0.5'):
        answer = (
            f'نعم، مصاريف هذا الأسبوع ({week_exp} {currency}) مرتفعة — '
            f'تشكل {ratio}% من مصاريف الشهر ({month_exp} {currency}).'
        )
        rec = 'راجع بنود المصاريف الأخيرة وتحقق من أي مبالغ غير اعتيادية.'
    else:
        answer = (
            f'مصاريف هذا الأسبوع ({week_exp} {currency}) ضمن المعدل الطبيعي — '
            f'{ratio}% من مصاريف الشهر ({month_exp} {currency}).'
        )
        rec = None
    return _response(answer, {'week': week, 'month': month}, rec)


def _answer_today_insights(ctx):
    currency = ctx.currency
    today_data = compute_period_profit(ctx.store, 'today')
    open_repairs = RepairOrder.objects.filter(store=ctx.store).exclude(
        status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED],
    ).count()
    stock_stats = Product.objects.filter(store=ctx.store, is_active=True).aggregate(
        low_stock=Count('id', filter=Q(quantity__lte=F('low_stock_threshold'))),
    )
    low_stock = stock_stats['low_stock'] or 0
    debt = Customer.objects.filter(store=ctx.store, is_active=True, debt__gt=0).aggregate(
        t=Sum('debt'),
    )['t'] or Decimal('0')
    answer = (
        f"📊 **ملخص اليوم ({currency}):**\n"
        f"• صافي الربح: {today_data['net_profit']}\n"
        f"• الإيرادات: {today_data['revenue']}\n"
        f"• المصاريف: {today_data['expenses']}\n"
        f"• صيانة مفتوحة: {open_repairs}\n"
        f"• منتجات منخفضة المخزون: {low_stock}\n"
        f"• ديون العملاء: {debt}"
    )
    rec = f'لديك {low_stock} منتجاً يحتاج إعادة طلب.' if low_stock > 0 else None
    return _response(
        answer,
        {'today': today_data, 'open_repairs': open_repairs, 'low_stock': low_stock},
        rec,
    )


def analyze_question(store, question: str) -> dict:
    """تحليل السؤال وإرجاع إجابة من البيانات الفعلية."""
    ctx = _AnalyticsContext(store)
    intent = _detect_intent(question)

    handlers = {
        'stockout_soon': lambda: _answer_stockout_soon(ctx),
        'customer_debt': lambda: _answer_customer_debt(ctx),
        'late_repairs': lambda: _answer_late_repairs(ctx),
        'low_margin': lambda: _answer_low_margin(ctx),
        'top_selling': lambda: _answer_top_selling(ctx),
        'month_profit': lambda: _answer_month_profit(ctx),
        'high_expenses': lambda: _answer_high_expenses(ctx),
        'most_profitable': lambda: _answer_most_profitable(ctx),
        'least_selling': lambda: _answer_least_selling(ctx),
        'reorder': lambda: _answer_reorder(ctx),
        'profit_decrease': lambda: _answer_profit_decrease(ctx),
        'best_supplier': lambda: _answer_best_supplier(ctx),
        'stale_products': lambda: _answer_stale_products(ctx),
        'today_insights': lambda: _answer_today_insights(ctx),
    }

    if intent and intent in handlers:
        return handlers[intent]()

    month = ctx.month_profit()
    return _response(
        f"إليك ملخص أعمالك: صافي ربح الشهر {month['net_profit']} {ctx.currency}.\n"
        "يمكنك سؤالي عن: الربحية، المخزون، الموردين، أو ملخص اليوم.",
        {'month': month},
        'جرّب أحد الأسئلة المقترحة للحصول على إجابة أدق.',
    )


def build_ai_context(store) -> str:
    """سياق البيانات لإرساله إلى LLM (OpenAI/Gemini/Local)."""
    metrics = compute_dashboard_metrics(store)
    breakdown = compute_profit_breakdown(store, 'month')
    low_stock = Product.objects.filter(
        store=store, is_active=True, quantity__lte=F('low_stock_threshold'),
    ).count()
    return (
        f"Store: {store.name}, Currency: {get_base_currency(store)}\n"
        f"Today net profit: {metrics['today']['net_profit']}\n"
        f"Month net profit: {metrics['month']['net_profit']}\n"
        f"Month revenue: {metrics['month']['revenue']}\n"
        f"Low stock products: {low_stock}\n"
        f"Breakdown: {breakdown['segments']}\n"
    )
