from decimal import Decimal

from django.db import transaction
from rest_framework.exceptions import ValidationError

from customers.models import Customer
from repairs.models import RepairOrder, RepairPayment
from sales.customer_account import apply_payment_to_customer_debt
from stores.currency_service import amount_in_base


def repair_outstanding(order: RepairOrder) -> Decimal:
    return max(Decimal('0'), Decimal(str(order.total_cost)) - Decimal(str(order.deposit_paid)))


@transaction.atomic
def apply_repair_customer_debt(order: RepairOrder):
    """Post remaining balance to customer debt once (on delivery)."""
    order = RepairOrder.objects.select_for_update().get(pk=order.pk)
    if order.debt_posted or not order.customer_id:
        return order
    remaining = repair_outstanding(order)
    if remaining <= 0:
        return order
    base_amount = amount_in_base(remaining, order.exchange_rate_to_base)
    customer = Customer.objects.select_for_update().get(pk=order.customer_id)
    customer.debt += base_amount
    customer.save(update_fields=['debt', 'updated_at'])
    order.debt_posted = True
    order.debt_posted_amount = base_amount
    order.save(update_fields=['debt_posted', 'debt_posted_amount', 'updated_at'])
    return order


@transaction.atomic
def reverse_repair_customer_debt(order: RepairOrder):
    """Undo debt posted on delivery (cancel / leave delivered)."""
    order = RepairOrder.objects.select_for_update().get(pk=order.pk)
    if not order.debt_posted or not order.customer_id:
        return order
    customer = Customer.objects.select_for_update().get(pk=order.customer_id)
    customer.debt = max(Decimal('0'), customer.debt - Decimal(str(order.debt_posted_amount)))
    customer.save(update_fields=['debt', 'updated_at'])
    order.debt_posted = False
    order.debt_posted_amount = Decimal('0')
    order.save(update_fields=['debt_posted', 'debt_posted_amount', 'updated_at'])
    return order


@transaction.atomic
def record_repair_payment(order, amount, user, method='cash', notes=''):
    """تسجيل دفعة على تذكرة صيانة (يزيد العربون/المدفوع)."""
    order = RepairOrder.objects.select_for_update().get(pk=order.pk)
    if order.status == RepairOrder.Status.CANCELLED:
        raise ValidationError('لا يمكن الدفع على تذكرة ملغاة.')

    amount = Decimal(str(amount))
    due = repair_outstanding(order)
    if amount <= 0:
        raise ValidationError('مبلغ الدفع يجب أن يكون أكبر من صفر.')
    if amount > due:
        raise ValidationError(f'المتبقي على التذكرة: {due}')

    order.deposit_paid = Decimal(str(order.deposit_paid)) + amount
    order.save(update_fields=['deposit_paid', 'updated_at'])

    RepairPayment.objects.create(
        store=order.store,
        repair=order,
        amount=amount,
        method=method,
        notes=notes,
        created_by=user,
    )

    if order.debt_posted and order.customer_id:
        customer = Customer.objects.select_for_update().get(pk=order.customer_id)
        apply_payment_to_customer_debt(customer, amount, order.exchange_rate_to_base)
        paid_base = amount_in_base(amount, order.exchange_rate_to_base)
        order.debt_posted_amount = max(Decimal('0'), Decimal(str(order.debt_posted_amount)) - paid_base)
        if repair_outstanding(order) <= 0:
            order.debt_posted = False
            order.debt_posted_amount = Decimal('0')
        order.save(update_fields=['debt_posted', 'debt_posted_amount', 'updated_at'])

    return order
