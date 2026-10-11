"""Cash drawer balances per store currency (computed + opening balance)."""
from decimal import Decimal

from django.db.models import Sum
from django.db.models.functions import Coalesce

from expenses.models import Expense
from purchases.models import Purchase, PurchasePayment
from repairs.models import RepairOrder, RepairPayment
from sales.models import Sale, SalePayment
from stores.currency_service import ensure_base_currency_row, get_base_currency
from stores.models import StoreCurrency


def _q(value) -> Decimal:
    return Decimal(str(value or 0))


def compute_cashbox(store):
    ensure_base_currency_row(store)
    base = get_base_currency(store)
    rows = StoreCurrency.objects.filter(store=store, is_active=True).order_by('code')
    result = []

    for row in rows:
        code = row.code
        opening = _q(row.opening_cash_balance)

        # دفعات نقدية مسجّلة (مبيعات جديدة بتقسيم الدفع + دفعات لاحقة)
        cash_sale_payments = SalePayment.objects.filter(
            store=store,
            method=SalePayment.Method.CASH,
            sale__currency=code,
        ).exclude(sale__status=Sale.Status.CANCELLED).aggregate(
            t=Coalesce(Sum('amount'), Decimal('0')),
        )['t']

        # مبيعات قديمة نقدية بالكامل بدون صفوف SalePayment (توافق خلفي)
        sales_with_payments = SalePayment.objects.filter(
            store=store, sale__currency=code,
        ).values_list('sale_id', flat=True).distinct()
        cash_sales = Sale.objects.filter(
            store=store,
            currency=code,
            payment_method=Sale.PaymentMethod.CASH,
        ).exclude(status=Sale.Status.CANCELLED).exclude(
            id__in=sales_with_payments,
        ).aggregate(
            t=Coalesce(Sum('amount_paid'), Decimal('0')),
        )['t']

        # Initial repair deposits not covered by RepairPayment rows (assumed cash)
        repair_deposit_extra = Decimal('0')
        for order in RepairOrder.objects.filter(store=store, currency=code).exclude(
            status=RepairOrder.Status.CANCELLED,
        ).only('deposit_paid', 'id'):
            paid_via_payments = RepairPayment.objects.filter(repair=order).aggregate(
                t=Coalesce(Sum('amount'), Decimal('0')),
            )['t']
            extra = _q(order.deposit_paid) - _q(paid_via_payments)
            if extra > 0:
                repair_deposit_extra += extra

        cash_repair_payments = RepairPayment.objects.filter(
            store=store,
            method=RepairPayment.Method.CASH,
            repair__currency=code,
        ).exclude(repair__status=RepairOrder.Status.CANCELLED).aggregate(
            t=Coalesce(Sum('amount'), Decimal('0')),
        )['t']

        cash_in = (
            _q(cash_sales)
            + _q(cash_sale_payments)
            + repair_deposit_extra
            + _q(cash_repair_payments)
        )

        cash_expenses = Expense.objects.filter(
            store=store,
            currency=code,
            payment_method=Expense.PaymentMethod.CASH,
            is_active=True,
        ).aggregate(t=Coalesce(Sum('amount'), Decimal('0')))['t']

        cash_purchases = Purchase.objects.filter(
            store=store,
            currency=code,
            payment_method=Purchase.PaymentMethod.CASH,
        ).exclude(status=Purchase.Status.CANCELLED).aggregate(
            t=Coalesce(Sum('amount_paid'), Decimal('0')),
        )['t']

        cash_purchase_payments = PurchasePayment.objects.filter(
            store=store,
            method=PurchasePayment.Method.CASH,
            purchase__currency=code,
        ).exclude(purchase__status=Purchase.Status.CANCELLED).aggregate(
            t=Coalesce(Sum('amount'), Decimal('0')),
        )['t']

        cash_out = _q(cash_expenses) + _q(cash_purchases) + _q(cash_purchase_payments)
        balance = opening + cash_in - cash_out

        result.append({
            'code': code,
            'is_base': code == base,
            'opening': str(opening),
            'cash_in': str(cash_in),
            'cash_out': str(cash_out),
            'balance': str(balance),
            'breakdown': {
                'cash_sales': str(_q(cash_sales)),
                'cash_sale_payments': str(_q(cash_sale_payments)),
                'repair_cash': str(repair_deposit_extra + _q(cash_repair_payments)),
                'expenses': str(_q(cash_expenses)),
                'purchases': str(_q(cash_purchases) + _q(cash_purchase_payments)),
            },
        })

    # تفصيل المبيعات حسب طريقة الدفع (من SalePayment + توافق قديم)
    method_totals = {}
    for row in SalePayment.objects.filter(store=store).exclude(
        sale__status=Sale.Status.CANCELLED,
    ).values('method').annotate(t=Coalesce(Sum('amount'), Decimal('0'))):
        method_totals[row['method']] = _q(row['t'])

    legacy_sales = Sale.objects.filter(store=store).exclude(
        status=Sale.Status.CANCELLED,
    ).exclude(
        id__in=SalePayment.objects.filter(store=store).values_list('sale_id', flat=True),
    )
    for sale in legacy_sales.only('payment_method', 'amount_paid'):
        key = sale.payment_method
        if key == Sale.PaymentMethod.PARTIAL:
            key = SalePayment.Method.CASH
        method_totals[key] = method_totals.get(key, Decimal('0')) + _q(sale.amount_paid)

    labels = dict(SalePayment.Method.choices)
    labels[Sale.PaymentMethod.PARTIAL] = 'آجل / جزئي'
    payment_breakdown = [
        {
            'method': method,
            'label': labels.get(method, method),
            'total': str(total.quantize(Decimal('0.01'))),
        }
        for method, total in sorted(method_totals.items(), key=lambda x: -x[1])
        if total > 0
    ]

    return {
        'base_currency': base,
        'currencies': result,
        'payment_methods': payment_breakdown,
    }


def set_opening_cash_balance(store, code: str, amount) -> StoreCurrency:
    from stores.currencies import normalize_currency

    code = normalize_currency(code)
    row = StoreCurrency.objects.filter(store=store, code=code).first()
    if not row:
        raise ValueError(f'العملة {code} غير مفعّلة في المتجر.')
    row.opening_cash_balance = _q(amount)
    row.save(update_fields=['opening_cash_balance', 'updated_at'])
    return row
