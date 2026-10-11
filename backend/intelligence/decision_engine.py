"""محرك مركز القرارات — توليد التنبيهات والتوصيات تلقائياً."""

import hashlib
import logging
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, F, Q, Sum
from django.utils import timezone

from core.date_ranges import local_day_bounds
from core.product_stats import ACTIVE_SALE_STATUSES
from customers.models import Customer
from intelligence.models import BusinessRecommendation, RecommendationRunLog
from intelligence.profit_service import compute_period_profit
from intelligence.sales_metrics import bulk_product_sales_metrics
from products.models import Product
from purchases.models import PurchaseItem
from repairs.models import RepairOrder
from sales.models import SaleItem

logger = logging.getLogger(__name__)

STALE_DAYS = 30
STOCKOUT_DAYS = 14
SALES_DROP_THRESHOLD = Decimal('0.30')
MIN_MARGIN_PERCENT = Decimal('10')
DEBT_WARNING_AMOUNT = Decimal('100')


def _fingerprint(*parts) -> str:
    raw = '|'.join(str(p) for p in parts)
    return hashlib.sha256(raw.encode()).hexdigest()


def _build_recommendation(store, **kwargs):
    fp = _fingerprint(store.id, kwargs.get('category'), kwargs.get('title'), kwargs.get('entity_type'), kwargs.get('entity_id'))
    return {
        'store': store,
        'fingerprint': fp,
        **kwargs,
    }


def generate_recommendations_for_store(store):
    """توليد جميع التوصيات لمتجر واحد."""
    recs = []
    today = timezone.localdate()

    products = list(Product.objects.filter(store=store, is_active=True).select_related('category'))
    product_ids = [p.id for p in products]
    last_sale_map, avg_daily_map, sold_recent_map, sold_previous_map = bulk_product_sales_metrics(
        store, product_ids,
    )

    for product in products:
        last_at = last_sale_map.get(product.id)
        last_sale = timezone.localtime(last_at).date() if last_at else None
        avg_daily = avg_daily_map.get(product.id, Decimal('0'))
        recent = sold_recent_map.get(product.id, 0)
        previous = sold_previous_map.get(product.id, 0)

        # 0. مخزون نافذ / منتهٍ
        if product.quantity == 0:
            had_recent_demand = recent > 0 or previous > 0 or avg_daily > 0
            recs.append(_build_recommendation(
                store,
                severity=BusinessRecommendation.Severity.CRITICAL if had_recent_demand else BusinessRecommendation.Severity.WARNING,
                kind=BusinessRecommendation.Kind.ALERT,
                category=BusinessRecommendation.Category.INVENTORY,
                title=f'مخزون نافذ: {product.name}',
                reason=(
                    f'المنتج {product.name} غير متوفر (0 وحدة).'
                    + (f' كان يُباع مؤخراً ({recent} وحدة هذا الأسبوع).' if recent else '')
                ),
                suggested_action=f'أعد طلب {product.name} فوراً أو عطّله إن لم يعد متاحاً.',
                entity_type=BusinessRecommendation.EntityType.PRODUCT,
                entity_id=product.id,
                entity_name=product.name,
            ))
            continue

        if product.quantity <= product.low_stock_threshold:
            recs.append(_build_recommendation(
                store,
                severity=BusinessRecommendation.Severity.CRITICAL if product.quantity <= 1 else BusinessRecommendation.Severity.WARNING,
                kind=BusinessRecommendation.Kind.ALERT,
                category=BusinessRecommendation.Category.INVENTORY,
                title=f'مخزون منتهٍ: {product.name}',
                reason=f'تبقى {product.quantity} وحدة فقط (حد التنبيه {product.low_stock_threshold}).',
                suggested_action=f'أعد طلب {product.name} قبل نفاد المخزون بالكامل.',
                entity_type=BusinessRecommendation.EntityType.PRODUCT,
                entity_id=product.id,
                entity_name=product.name,
            ))

        # 1. لم يُبَع منذ X يوم
        if product.quantity > 0:
            if last_sale is None:
                days_stale = (today - product.created_at.date()).days
            else:
                days_stale = (today - last_sale).days

            if days_stale >= STALE_DAYS:
                recs.append(_build_recommendation(
                    store,
                    severity=BusinessRecommendation.Severity.WARNING,
                    kind=BusinessRecommendation.Kind.ALERT,
                    category=BusinessRecommendation.Category.INVENTORY,
                    title=f'منتج راكد: {product.name}',
                    reason=f'لم يُبَع {product.name} منذ {days_stale} يوماً رغم وجود {product.quantity} وحدة في المخزون.',
                    suggested_action=f'فكّر في تخفيض السعر أو إنشاء عرض ترويجي لـ {product.name}.',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))
                recs.append(_build_recommendation(
                    store,
                    severity=BusinessRecommendation.Severity.INFO,
                    kind=BusinessRecommendation.Kind.RECOMMENDATION,
                    category=BusinessRecommendation.Category.SALES,
                    title=f'إنشاء عرض ترويجي: {product.name}',
                    reason=f'المخزون راكد ({days_stale} يوم بدون مبيعات).',
                    suggested_action=f'أنشئ عرضاً ترويجياً أو حزمة مع منتجات أخرى لـ {product.name}.',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))

        # 2. نفاد المخزون المتوقع
        if product.quantity > 0 and avg_daily > 0:
            days_left = Decimal(product.quantity) / avg_daily
            if days_left <= STOCKOUT_DAYS:
                sev = BusinessRecommendation.Severity.CRITICAL if days_left <= 7 else BusinessRecommendation.Severity.WARNING
                recs.append(_build_recommendation(
                    store,
                    severity=sev,
                    kind=BusinessRecommendation.Kind.ALERT,
                    category=BusinessRecommendation.Category.INVENTORY,
                    title=f'نفاد مخزون متوقع: {product.name}',
                    reason=f'المخزون الحالي {product.quantity} وحدة. بمعدل بيع {avg_daily.quantize(Decimal("0.1"))}/يوم، ينفد خلال {int(days_left)} يوم.',
                    suggested_action=f'زِد مخزون {product.name} فوراً.',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))
                recs.append(_build_recommendation(
                    store,
                    severity=BusinessRecommendation.Severity.INFO,
                    kind=BusinessRecommendation.Kind.RECOMMENDATION,
                    category=BusinessRecommendation.Category.INVENTORY,
                    title=f'زيادة مخزون: {product.name}',
                    reason=f'معدل البيع مرتفع والمخزون ينفد خلال {int(days_left)} يوم.',
                    suggested_action=f'اطلب {max(10, int(avg_daily * 30))} وحدة من {product.name}.',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))

        # 3. انخفاض المبيعات
        if previous > 0 and recent < previous:
            drop = Decimal(previous - recent) / Decimal(previous)
            if drop >= SALES_DROP_THRESHOLD:
                recs.append(_build_recommendation(
                    store,
                    severity=BusinessRecommendation.Severity.WARNING,
                    kind=BusinessRecommendation.Kind.ALERT,
                    category=BusinessRecommendation.Category.SALES,
                    title=f'انخفاض مبيعات: {product.name}',
                    reason=f'مبيعات الأسبوع الأخير ({recent}) أقل بنسبة {int(drop * 100)}% عن الأسبوع السابق ({previous}).',
                    suggested_action=f'راجع التسعير والعرض التسويقي لـ {product.name}.',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))

        # 4. هامش ربح منخفض
        if product.sell_price > 0 and product.buy_price > 0:
            margin = (product.sell_price - product.buy_price) / product.sell_price * 100
            if margin < MIN_MARGIN_PERCENT:
                sev = BusinessRecommendation.Severity.CRITICAL if margin <= 0 else BusinessRecommendation.Severity.WARNING
                recs.append(_build_recommendation(
                    store,
                    severity=sev,
                    kind=BusinessRecommendation.Kind.ALERT,
                    category=BusinessRecommendation.Category.PROFIT,
                    title=f'هامش ربح منخفض: {product.name}',
                    reason=f'هامش الربح {margin.quantize(Decimal("0.1"))}% (شراء: {product.buy_price}، بيع: {product.sell_price}).',
                    suggested_action='راجع سعر البيع أو ابحث عن مورد بسعر أفضل.' if margin > 0 else f'تحذير: {product.name} يُباع بخسارة!',
                    entity_type=BusinessRecommendation.EntityType.PRODUCT,
                    entity_id=product.id,
                    entity_name=product.name,
                ))

        # 5. مخزون زائد + مبيعات بطيئة → تقليل
        if product.quantity > product.low_stock_threshold * 5 and avg_daily and avg_daily < Decimal('0.5'):
            recs.append(_build_recommendation(
                store,
                severity=BusinessRecommendation.Severity.INFO,
                kind=BusinessRecommendation.Kind.RECOMMENDATION,
                category=BusinessRecommendation.Category.INVENTORY,
                title=f'تقليل مخزون: {product.name}',
                reason=f'مخزون عالي ({product.quantity}) مع مبيعات بطيئة ({avg_daily.quantize(Decimal("0.1"))}/يوم).',
                suggested_action=f'قلّل طلبات {product.name} أو اعرضه بخصم.',
                entity_type=BusinessRecommendation.EntityType.PRODUCT,
                entity_id=product.id,
                entity_name=product.name,
            ))

    # 6. ديون العملاء
    for customer in Customer.objects.filter(store=store, is_active=True, debt__gt=0):
        sev = BusinessRecommendation.Severity.CRITICAL if customer.debt >= DEBT_WARNING_AMOUNT * 5 else BusinessRecommendation.Severity.WARNING
        recs.append(_build_recommendation(
            store,
            severity=sev,
            kind=BusinessRecommendation.Kind.ALERT,
            category=BusinessRecommendation.Category.CUSTOMER,
            title=f'دين مستحق: {customer.name}',
            reason=f'العميل {customer.name} ({customer.phone}) لديه رصيد مستحق {customer.debt}.',
            suggested_action=f'تواصل مع {customer.name} بخصوص الرصيد غير المدفوع.',
            entity_type=BusinessRecommendation.EntityType.CUSTOMER,
            entity_id=customer.id,
            entity_name=customer.name,
        ))

    # 7. صيانة متأخرة
    for order in RepairOrder.objects.filter(
        store=store,
        estimated_delivery__lt=today,
    ).exclude(status__in=[RepairOrder.Status.DELIVERED, RepairOrder.Status.CANCELLED]):
        days_late = (today - order.estimated_delivery).days
        recs.append(_build_recommendation(
            store,
            severity=BusinessRecommendation.Severity.CRITICAL if days_late > 3 else BusinessRecommendation.Severity.WARNING,
            kind=BusinessRecommendation.Kind.ALERT,
            category=BusinessRecommendation.Category.REPAIR,
            title=f'صيانة متأخرة: {order.ticket_number}',
            reason=f'تذكرة {order.ticket_number} تجاوزت موعد التسليم المتوقع بـ {days_late} يوم.',
            suggested_action=f'حدّث حالة الصيانة أو تواصل مع العميل {order.customer_name or "—"}.',
            entity_type=BusinessRecommendation.EntityType.REPAIR,
            entity_id=order.id,
            entity_name=order.ticket_number,
        ))

    # 8. إعادة الطلب من الموردين
    low_stock_products = [p for p in products if p.quantity <= p.low_stock_threshold]
    supplier_products = defaultdict(list)
    supplier_seen = defaultdict(set)
    if low_stock_products:
        low_ids = [p.id for p in low_stock_products]
        for item in PurchaseItem.objects.filter(
            product_id__in=low_ids,
            purchase__store=store,
            purchase__supplier__isnull=False,
        ).select_related('purchase__supplier', 'product').order_by('-purchase__created_at'):
            sid = item.purchase.supplier_id
            if not item.product_id or item.product_id in supplier_seen[sid]:
                continue
            supplier_seen[sid].add(item.product_id)
            supplier_products[sid].append({
                'id': item.product_id,
                'name': item.product.name if item.product else item.product_name,
                'supplier': item.purchase.supplier,
            })

    for sid, prods in supplier_products.items():
        supplier = prods[0]['supplier']
        names = ', '.join(p['name'] for p in prods[:3])
        recs.append(_build_recommendation(
            store,
            severity=BusinessRecommendation.Severity.INFO,
            kind=BusinessRecommendation.Kind.RECOMMENDATION,
            category=BusinessRecommendation.Category.SUPPLIER,
            title=f'إعادة طلب من {supplier.name}',
            reason=f'منتجات منخفضة المخزون من هذا المورد: {names}.',
            suggested_action=f'تواصل مع {supplier.name} ({supplier.phone or "—"}) لإعادة الطلب.',
            entity_type=BusinessRecommendation.EntityType.SUPPLIER,
            entity_id=supplier.id,
            entity_name=supplier.name,
        ))

    # 9. تنبيهات الأرباح
    week_profit = compute_period_profit(store, 'week')
    prev_week_start = today - timedelta(days=14)
    prev_week_data = compute_period_profit(store, 'week', prev_week_start + timedelta(days=7))
    current_net = Decimal(week_profit['net_profit'])
    prev_net = Decimal(prev_week_data['net_profit'])
    if prev_net > 0 and current_net < prev_net * Decimal('0.7'):
        recs.append(_build_recommendation(
            store,
            severity=BusinessRecommendation.Severity.WARNING,
            kind=BusinessRecommendation.Kind.ALERT,
            category=BusinessRecommendation.Category.PROFIT,
            title='انخفاض صافي الربح',
            reason=f'صافي ربح هذا الأسبوع ({current_net}) أقل بنسبة كبيرة عن الأسبوع السابق ({prev_net}).',
            suggested_action='راجع المصاريف والمبيعات والهوامش لتحديد السبب.',
        ))

    month_expenses = Decimal(compute_period_profit(store, 'month')['expenses'])
    week_expenses = Decimal(week_profit['expenses'])
    if week_expenses > month_expenses * Decimal('0.5') and month_expenses > 0:
        recs.append(_build_recommendation(
            store,
            severity=BusinessRecommendation.Severity.WARNING,
            kind=BusinessRecommendation.Kind.ALERT,
            category=BusinessRecommendation.Category.EXPENSE,
            title='مصاريف مرتفعة هذا الأسبوع',
            reason=f'مصاريف الأسبوع ({week_expenses}) تشكل أكثر من 50% من مصاريف الشهر ({month_expenses}).',
            suggested_action='راجع بنود المصاريف الأخيرة وتحقق من أي مبالغ غير اعتيادية.',
        ))

    # 10. فرص تجارية
    top_sellers = SaleItem.objects.filter(
        sale__store=store,
        sale__status__in=ACTIVE_SALE_STATUSES,
        sale__created_at__gte=local_day_bounds(today - timedelta(days=30))[0],
    ).values('product_id', 'product_name').annotate(
        sold=Sum(F('quantity') - F('quantity_returned')),
    ).order_by('-sold')[:3]

    for row in top_sellers:
        if row['product_id'] and row['sold'] and row['sold'] >= 5:
            recs.append(_build_recommendation(
                store,
                severity=BusinessRecommendation.Severity.INFO,
                kind=BusinessRecommendation.Kind.OPPORTUNITY,
                category=BusinessRecommendation.Category.SALES,
                title=f'فرصة: {row["product_name"]}',
                reason=f'{row["product_name"]} من أكثر المنتجات مبيعاً ({row["sold"]} وحدة خلال 30 يوم).',
                suggested_action=f'تأكد من توفر مخزون كافٍ واستغل الشعبية في عروض مجمعة.',
                entity_type=BusinessRecommendation.EntityType.PRODUCT,
                entity_id=row['product_id'],
                entity_name=row['product_name'] or '—',
            ))

    return recs


@transaction.atomic
def refresh_store_recommendations(store):
    """تحديث التوصيات — يحذف القديمة غير المرفوضة ويُنشئ الجديدة."""
    recs_data = generate_recommendations_for_store(store)
    fingerprints = {r['fingerprint'] for r in recs_data}

    # إلغاء تنشيط القديمة غير الموجودة
    BusinessRecommendation.objects.filter(
        store=store,
        is_active=True,
        is_dismissed=False,
    ).exclude(fingerprint__in=fingerprints).update(is_active=False)

    created_count = 0
    for data in recs_data:
        obj, created = BusinessRecommendation.objects.update_or_create(
            store=store,
            fingerprint=data['fingerprint'],
            defaults={
                'severity': data['severity'],
                'kind': data['kind'],
                'category': data['category'],
                'title': data['title'],
                'reason': data['reason'],
                'suggested_action': data['suggested_action'],
                'entity_type': data.get('entity_type', ''),
                'entity_id': data.get('entity_id'),
                'entity_name': data.get('entity_name', ''),
                'is_active': True,
                'generated_at': timezone.now(),
            },
        )
        if created:
            created_count += 1

    RecommendationRunLog.objects.update_or_create(
        store=store,
        defaults={
            'last_run_at': timezone.now(),
            'recommendations_count': BusinessRecommendation.objects.filter(
                store=store, is_active=True, is_dismissed=False,
            ).count(),
        },
    )
    logger.info('Generated %d recommendations for store %s', len(recs_data), store.id)
    return len(recs_data)


def get_decision_center_summary(store):
    """ملخص سريع من قاعدة البيانات — استعلام واحد."""
    qs = BusinessRecommendation.objects.filter(store=store, is_active=True, is_dismissed=False)
    counts = qs.aggregate(
        total_active=Count('id'),
        critical_count=Count('id', filter=Q(severity=BusinessRecommendation.Severity.CRITICAL)),
        opportunities_count=Count('id', filter=Q(kind=BusinessRecommendation.Kind.OPPORTUNITY)),
        warning_count=Count('id', filter=Q(severity=BusinessRecommendation.Severity.WARNING)),
        info_count=Count('id', filter=Q(severity=BusinessRecommendation.Severity.INFO)),
    )
    log = RecommendationRunLog.objects.filter(store=store).only('last_run_at').first()
    return {
        **counts,
        'last_generated_at': log.last_run_at if log else None,
    }


def ensure_daily_recommendations(store):
    """تشغيل تلقائي مرة واحدة يومياً — للـ cron وزر التحديث اليدوي فقط."""
    log = RecommendationRunLog.objects.filter(store=store).only('last_run_at').first()
    today = timezone.localdate()
    if log and timezone.localtime(log.last_run_at).date() >= today:
        return False
    refresh_store_recommendations(store)
    return True
