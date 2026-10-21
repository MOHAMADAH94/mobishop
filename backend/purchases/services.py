from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from core.audit import log_audit
from core.idempotency import normalize_client_request_id
from core.models import AuditLog
from products.models import InventoryLog, Product
from products.services import adjust_inventory
from purchases.models import Purchase, PurchaseItem, PurchasePayment
from purchases.supplier_account import (
    adjust_supplier_balance_on_cancel,
    apply_payment_to_supplier_balance,
    purchase_outstanding,
)
from stores.currency_service import (
    FOURPLACES,
    convert_amount,
    get_base_currency,
    quantize_price,
    snapshot_rate,
    validate_transaction_currency,
)


def _next_invoice_number(store):
    prefix = getattr(store.settings, 'purchase_invoice_prefix', None) or 'PUR'
    last = Purchase.objects.filter(store=store).aggregate(m=Max('id'))['m'] or 0
    return f'{prefix}-{last + 1:06d}'


@transaction.atomic
def create_purchase(store, user, items_data, supplier=None, payment_method='cash',
                    discount=Decimal('0'), amount_paid=None, notes='',
                    currency=None, exchange_rate_override=None, client_request_id=None):
    client_request_id = normalize_client_request_id(client_request_id)
    if client_request_id:
        existing = Purchase.objects.filter(store=store, client_request_id=client_request_id).first()
        if existing:
            existing._idempotent_replay = True
            return existing

    settings = store.settings
    tax_rate = settings.tax_rate / Decimal('100')
    base_currency = get_base_currency(store)
    pay_currency = validate_transaction_currency(store, currency or base_currency)
    rate = snapshot_rate(store, pay_currency, exchange_rate_override)

    subtotal = Decimal('0')
    purchase_items = []

    for item in items_data:
        product = Product.objects.select_for_update().get(
            pk=item['product_id'], store=store, is_active=True
        )
        from products.quantity import normalize_product_qty
        try:
            qty = normalize_product_qty(product, item['quantity'])
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc

        unit_cost_base = quantize_price(item.get('unit_cost', product.buy_price))
        if unit_cost_base < 0:
            raise ValidationError(f'سعر الشراء غير صالح للمنتج: {product.name}')
        line_total_base = quantize_price(unit_cost_base * qty)
        subtotal += line_total_base

        unit_cost = convert_amount(
            unit_cost_base, base_currency, pay_currency, store, exchange_rate_override,
            places=FOURPLACES,
        )
        line_total = convert_amount(
            line_total_base, base_currency, pay_currency, store, exchange_rate_override,
            places=FOURPLACES,
        )

        purchase_items.append({
            'product': product,
            'product_name': product.name,
            'sku': product.sku,
            'quantity': qty,
            'unit_cost': unit_cost,
            'unit_cost_base': unit_cost_base,
            'line_total': line_total,
        })

    discount_base = quantize_price(discount)
    discount_converted = convert_amount(
        discount_base, base_currency, pay_currency, store, exchange_rate_override,
        places=FOURPLACES,
    )
    tax_amount = quantize_price((subtotal - discount_base) * tax_rate)
    total_base = quantize_price(subtotal - discount_base + tax_amount)
    total = convert_amount(
        total_base, base_currency, pay_currency, store, exchange_rate_override,
        places=FOURPLACES,
    )
    tax_amount_converted = convert_amount(
        tax_amount, base_currency, pay_currency, store, exchange_rate_override,
        places=FOURPLACES,
    )
    subtotal_converted = convert_amount(
        subtotal, base_currency, pay_currency, store, exchange_rate_override,
        places=FOURPLACES,
    )

    if amount_paid is None:
        amount_paid = total
    else:
        amount_paid = quantize_price(amount_paid)

    if payment_method == Purchase.PaymentMethod.PARTIAL:
        if not supplier:
            raise ValidationError('الدفع الجزئي يتطلب اختيار مورد.')
        if amount_paid >= total:
            raise ValidationError('للدفع الكامل اختر نقدي أو إلكتروني بدلاً من جزئي.')

    try:
        with transaction.atomic():
            purchase = Purchase.objects.create(
                store=store,
                invoice_number=_next_invoice_number(store),
                supplier=supplier,
                currency=pay_currency,
                exchange_rate_to_base=rate,
                payment_method=payment_method,
                subtotal=subtotal_converted,
                discount=discount_converted,
                tax_amount=tax_amount_converted,
                total=total,
                amount_paid=amount_paid,
                notes=notes,
                client_request_id=client_request_id,
                created_by=user,
            )
    except IntegrityError:
        if client_request_id:
            existing = Purchase.objects.filter(store=store, client_request_id=client_request_id).first()
            if existing:
                existing._idempotent_replay = True
                return existing
        raise

    for pi in purchase_items:
        PurchaseItem.objects.create(
            purchase=purchase,
            product=pi['product'],
            product_name=pi['product_name'],
            sku=pi['sku'],
            quantity=pi['quantity'],
            unit_cost=pi['unit_cost'],
            line_total=pi['line_total'],
        )
        product = pi['product']
        product.buy_price = pi['unit_cost_base']
        product.save(update_fields=['buy_price', 'updated_at'])
        adjust_inventory(
            product,
            pi['quantity'],
            InventoryLog.Action.PURCHASE,
            user=user,
            reference=purchase.invoice_number,
        )

    if supplier and payment_method == Purchase.PaymentMethod.PARTIAL:
        payable = total - amount_paid
        if payable > 0:
            from stores.currency_service import amount_in_base
            supplier.balance += amount_in_base(payable, rate)
            supplier.save(update_fields=['balance', 'updated_at'])

    return purchase


@transaction.atomic
def record_purchase_payment(purchase, amount, user, method='cash', notes=''):
    if purchase.status == Purchase.Status.CANCELLED:
        raise ValidationError('لا يمكن الدفع على فاتورة ملغاة.')

    amount = Decimal(str(amount))
    due = purchase_outstanding(purchase)
    if amount <= 0:
        raise ValidationError('مبلغ الدفع يجب أن يكون أكبر من صفر.')
    if amount > due:
        raise ValidationError(f'المتبقي على الفاتورة: {due}')

    purchase = Purchase.objects.select_for_update().get(pk=purchase.pk)
    purchase.amount_paid += amount

    if purchase_outstanding(purchase) <= 0:
        purchase.payment_method = method

    purchase.save(update_fields=['amount_paid', 'payment_method', 'updated_at'])

    PurchasePayment.objects.create(
        store=purchase.store,
        purchase=purchase,
        amount=amount,
        method=method,
        notes=notes,
        created_by=user,
    )

    if purchase.supplier_id:
        supplier = purchase.supplier
        apply_payment_to_supplier_balance(supplier, amount, purchase.exchange_rate_to_base)

    return purchase


@transaction.atomic
def cancel_purchase(purchase, user, request=None):
    if purchase.status == Purchase.Status.CANCELLED:
        raise ValidationError('الفاتورة ملغاة مسبقاً.')

    for item in purchase.items.select_related('product'):
        if item.product:
            if item.product.quantity < item.quantity:
                raise ValidationError(
                    f'لا يمكن الإلغاء: الكمية الحالية من {item.product_name} أقل من المشتراة.'
                )
            adjust_inventory(
                item.product,
                -item.quantity,
                InventoryLog.Action.REMOVE,
                user=user,
                reference=purchase.invoice_number,
                notes='إلغاء فاتورة شراء',
            )

    adjust_supplier_balance_on_cancel(purchase)
    purchase.status = Purchase.Status.CANCELLED
    purchase.save(update_fields=['status', 'updated_at'])

    if request:
        log_audit(request, AuditLog.Action.DELETE, 'Purchase', purchase.id)

    return purchase
