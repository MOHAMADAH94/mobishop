from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max
from rest_framework.exceptions import ValidationError

from core.audit import log_audit
from core.models import AuditLog
from products.models import InventoryLog, Product
from products.services import adjust_inventory
from sales.customer_account import (
    adjust_customer_debt_after_return,
    adjust_customer_debt_on_cancel,
    apply_payment_to_customer_debt,
    sale_outstanding,
)
from stores.currency_service import (
    FOURPLACES,
    convert_amount,
    get_base_currency,
    quantize_price,
    resolve_rate_override,
    snapshot_rate,
    validate_transaction_currency,
)
from sales.models import Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem


def _next_invoice_number(store):
    prefix = store.settings.invoice_prefix
    last = Sale.objects.filter(store=store).aggregate(m=Max('id'))['m'] or 0
    return f'{prefix}-{last + 1:06d}'


def _next_return_number(store):
    last = SaleReturn.objects.filter(store=store).aggregate(m=Max('id'))['m'] or 0
    return f'RTN-{last + 1:06d}'


def _normalize_payment_lines(payments, payment_method, amount_paid, total):
    """Build validated payment allocation rows (backend is source of truth)."""
    tender_methods = {
        SalePayment.Method.CASH,
        SalePayment.Method.CARD,
        SalePayment.Method.BANK_TRANSFER,
        SalePayment.Method.E_WALLET,
        SalePayment.Method.ELECTRONIC,
        SalePayment.Method.OTHER,
    }
    lines = []
    if payments:
        seen = set()
        for row in payments:
            method = str(row.get('method') or '').strip()
            if method not in tender_methods:
                raise ValidationError(f'طريقة دفع غير صالحة: {method}')
            if method in seen:
                raise ValidationError('لا تكرر نفس طريقة الدفع في التقسيم.')
            seen.add(method)
            amount = quantize_price(Decimal(str(row.get('amount', 0))))
            if amount < 0:
                raise ValidationError('مبلغ الدفع لا يمكن أن يكون سالباً.')
            if amount == 0:
                continue
            lines.append({'method': method, 'amount': amount})
        if not lines:
            raise ValidationError('أدخل مبلغاً واحداً على الأقل لطرق الدفع.')
    else:
        method = payment_method or Sale.PaymentMethod.CASH
        if method == Sale.PaymentMethod.PARTIAL:
            paid = quantize_price(amount_paid if amount_paid is not None else Decimal('0'))
            if paid > 0:
                lines.append({'method': SalePayment.Method.CASH, 'amount': paid})
        elif method in tender_methods:
            paid = quantize_price(amount_paid if amount_paid is not None else total)
            lines.append({'method': method, 'amount': paid})
        else:
            raise ValidationError('طريقة الدفع غير صالحة.')

    allocated = sum((x['amount'] for x in lines), Decimal('0'))
    allocated = quantize_price(allocated)
    if allocated > total:
        raise ValidationError('مجموع الدفعات يتجاوز إجمالي الفاتورة.')
    return lines, allocated


@transaction.atomic
def create_sale(store, user, items_data, customer=None, payment_method='cash',
                discount=Decimal('0'), amount_paid=None, notes='',
                currency=None, exchange_rate_override=None, display_exchange_rate=None,
                client_request_id=None, payments=None):
    from products.quantity import normalize_product_qty, to_qty

    if client_request_id:
        client_request_id = str(client_request_id).strip()[:64] or None
    if client_request_id:
        existing = Sale.objects.filter(store=store, client_request_id=client_request_id).first()
        if existing:
            existing._idempotent_replay = True
            return existing

    settings = store.settings
    tax_rate = settings.tax_rate / Decimal('100')
    base_currency = get_base_currency(store)
    pay_currency = validate_transaction_currency(store, currency or base_currency)
    rate_override = resolve_rate_override(
        store, pay_currency, exchange_rate_override, display_exchange_rate,
    )
    rate = snapshot_rate(store, pay_currency, rate_override)

    discount = quantize_price(discount)
    subtotal = Decimal('0')
    sale_items = []

    for item in items_data:
        product = Product.objects.select_for_update().get(
            pk=item['product_id'], store=store, is_active=True
        )
        try:
            qty = normalize_product_qty(product, item['quantity'])
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        # خدمات/تفعيل (تكلفة شراء 0): يُسمح بالبيع دون رصيد مخزون صارم
        if product.buy_price > 0 and to_qty(product.quantity) < qty:
            raise ValidationError(f'الكمية غير كافية للمنتج: {product.name}')

        unit_price_base = quantize_price(item.get('unit_price', product.sell_price))
        line_discount_base = quantize_price(item.get('discount', 0))
        line_total_base = quantize_price((unit_price_base * qty) - line_discount_base)
        subtotal += line_total_base

        unit_price = convert_amount(
            unit_price_base, base_currency, pay_currency, store, rate_override,
            places=FOURPLACES,
        )
        line_discount = convert_amount(
            line_discount_base, base_currency, pay_currency, store, rate_override,
            places=FOURPLACES,
        )
        line_total = convert_amount(
            line_total_base, base_currency, pay_currency, store, rate_override,
            places=FOURPLACES,
        )

        sale_items.append({
            'product': product,
            'product_name': product.name,
            'sku': product.sku,
            'imei': product.imei or '',
            'quantity': qty,
            'unit_price': unit_price,
            'cost_price': product.buy_price,
            'discount': line_discount,
            'line_total': line_total,
        })

    discount_base = discount
    discount_converted = convert_amount(
        discount_base, base_currency, pay_currency, store, rate_override,
        places=FOURPLACES,
    )
    tax_amount = quantize_price((subtotal - discount_base) * tax_rate)
    total_base = quantize_price(subtotal - discount_base + tax_amount)
    total = convert_amount(
        total_base, base_currency, pay_currency, store, rate_override,
        places=FOURPLACES,
    )
    tax_amount_converted = convert_amount(
        tax_amount, base_currency, pay_currency, store, rate_override,
        places=FOURPLACES,
    )
    subtotal_converted = convert_amount(
        subtotal, base_currency, pay_currency, store, rate_override,
        places=FOURPLACES,
    )
    total = quantize_price(total)

    payment_lines, allocated = _normalize_payment_lines(
        payments, payment_method, amount_paid, total,
    )
    remaining = quantize_price(total - allocated)

    if remaining > 0:
        if not customer:
            raise ValidationError('المتبقي الآجل يتطلب اختيار عميل.')
        header_method = Sale.PaymentMethod.PARTIAL
    elif len(payment_lines) == 1:
        header_method = payment_lines[0]['method']
    else:
        # فاتورة مدفوعة بالكامل بعدة طرق — نعرض الطريقة الأولى كملخص
        header_method = payment_lines[0]['method']

    amount_paid_final = allocated

    try:
        with transaction.atomic():
            sale = Sale.objects.create(
                store=store,
                invoice_number=_next_invoice_number(store),
                customer=customer,
                currency=pay_currency,
                exchange_rate_to_base=rate,
                payment_method=header_method,
                subtotal=subtotal_converted,
                discount=discount_converted,
                tax_amount=tax_amount_converted,
                total=total,
                amount_paid=amount_paid_final,
                notes=notes,
                client_request_id=client_request_id,
                created_by=user,
            )
    except IntegrityError:
        if client_request_id:
            existing = Sale.objects.filter(store=store, client_request_id=client_request_id).first()
            if existing:
                existing._idempotent_replay = True
                return existing
        raise

    for si in sale_items:
        SaleItem.objects.create(
            sale=sale,
            product=si['product'],
            product_name=si['product_name'],
            sku=si['sku'],
            imei=si['imei'],
            quantity=si['quantity'],
            unit_price=si['unit_price'],
            cost_price=si['cost_price'],
            discount=si['discount'],
            line_total=si['line_total'],
        )
        adjust_inventory(
            si['product'],
            -si['quantity'],
            InventoryLog.Action.SALE,
            user=user,
            reference=sale.invoice_number,
        )

    for line in payment_lines:
        SalePayment.objects.create(
            store=store,
            sale=sale,
            amount=line['amount'],
            method=line['method'],
            notes='دفعة عند البيع',
            created_by=user,
        )

    if customer and remaining > 0:
        from stores.currency_service import amount_in_base
        customer.debt += amount_in_base(remaining, rate)
        customer.save(update_fields=['debt', 'updated_at'])

    return sale


@transaction.atomic
def record_sale_payment(sale, amount, user, method='cash', notes=''):
    """تسجيل دفعة لإكمال المتبقي على الفاتورة."""
    if sale.status == Sale.Status.CANCELLED:
        raise ValidationError('لا يمكن الدفع على فاتورة ملغاة.')

    amount = quantize_price(amount)
    due = sale_outstanding(sale)
    if amount <= 0:
        raise ValidationError('مبلغ الدفع يجب أن يكون أكبر من صفر.')
    if amount > due:
        raise ValidationError(f'المتبقي على الفاتورة: {due}')

    sale = Sale.objects.select_for_update().get(pk=sale.pk)
    sale.amount_paid = quantize_price(sale.amount_paid + amount)

    if sale_outstanding(sale) <= 0:
        sale.payment_method = method

    sale.save(update_fields=['amount_paid', 'payment_method', 'updated_at'])

    SalePayment.objects.create(
        store=sale.store,
        sale=sale,
        amount=amount,
        method=method,
        notes=notes,
        created_by=user,
    )

    if sale.customer_id:
        customer = sale.customer
        apply_payment_to_customer_debt(customer, amount, sale.exchange_rate_to_base)

    return sale


@transaction.atomic
def process_partial_return(sale, user, items_data, notes=''):
    if sale.status == Sale.Status.CANCELLED:
        raise ValidationError('لا يمكن إرجاع منتجات من فاتورة ملغاة.')

    store = sale.store
    tax_rate = store.settings.tax_rate / Decimal('100')
    refund_subtotal = Decimal('0')
    return_lines = []

    for row in items_data:
        sale_item = SaleItem.objects.select_for_update().get(
            pk=row['sale_item_id'], sale=sale
        )
        from products.quantity import to_qty
        try:
            qty = to_qty(row['quantity'])
        except ValueError as exc:
            raise ValidationError(str(exc)) from exc
        if qty <= 0:
            raise ValidationError('كمية المرتجع يجب أن تكون أكبر من صفر.')
        available = sale_item.quantity_available_to_return
        if qty > available:
            raise ValidationError(
                f'الكمية المتاحة للإرجاع من {sale_item.product_name}: {available}'
            )

        unit_refund = sale_item.unit_price - (sale_item.discount / sale_item.quantity)
        line_refund = quantize_price(unit_refund * qty)
        refund_subtotal += line_refund
        return_lines.append((sale_item, qty, line_refund))

    refund_tax = quantize_price(refund_subtotal * tax_rate)
    refund_total = quantize_price(refund_subtotal + refund_tax)

    sale_return = SaleReturn.objects.create(
        store=store,
        sale=sale,
        return_number=_next_return_number(store),
        refund_amount=refund_total,
        notes=notes,
        created_by=user,
    )

    for sale_item, qty, line_refund in return_lines:
        SaleReturnItem.objects.create(
            sale_return=sale_return,
            sale_item=sale_item,
            quantity=qty,
            refund_amount=line_refund,
        )
        sale_item.quantity_returned += qty
        sale_item.save(update_fields=['quantity_returned'])

        if sale_item.product:
            adjust_inventory(
                sale_item.product,
                qty,
                InventoryLog.Action.RETURN,
                user=user,
                reference=f'{sale.invoice_number}/{sale_return.return_number}',
                notes='مرتجع جزئي',
            )

    sale.total_returned += refund_total
    all_returned = all(
        item.quantity_returned >= item.quantity for item in sale.items.all()
    )
    if all_returned:
        sale.status = Sale.Status.CANCELLED
    else:
        sale.status = Sale.Status.PARTIALLY_RETURNED
    sale.save(update_fields=['total_returned', 'status', 'updated_at'])
    adjust_customer_debt_after_return(sale, refund_total)

    return sale_return


@transaction.atomic
def cancel_sale(sale, user, request=None):
    if sale.status == Sale.Status.CANCELLED:
        raise ValidationError('الفاتورة ملغاة مسبقاً.')

    for item in sale.items.select_related('product'):
        qty_to_restore = item.quantity_available_to_return
        if item.product and qty_to_restore > 0:
            adjust_inventory(
                item.product,
                qty_to_restore,
                InventoryLog.Action.RETURN,
                user=user,
                reference=sale.invoice_number,
                notes='إلغاء فاتورة',
            )
        item.quantity_returned = item.quantity
        item.save(update_fields=['quantity_returned'])

    adjust_customer_debt_on_cancel(sale)
    sale.status = Sale.Status.CANCELLED
    sale.save(update_fields=['status', 'updated_at'])

    if request:
        log_audit(request, AuditLog.Action.DELETE, 'Sale', sale.id)

    return sale
