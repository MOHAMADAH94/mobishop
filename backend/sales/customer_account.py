from decimal import Decimal

from customers.models import Customer
from stores.currency_service import amount_in_base


def sale_outstanding(sale) -> Decimal:
    """المبلغ المتبقي على الفاتورة بعد المرتجعات."""
    return max(Decimal('0'), sale.total - sale.total_returned - sale.amount_paid)


def _debt_delta_in_base(amount_in_sale_currency: Decimal, exchange_rate_to_base) -> Decimal:
    return amount_in_base(amount_in_sale_currency, exchange_rate_to_base)


def adjust_customer_debt_after_return(sale, refund_total: Decimal):
    if not sale.customer_id:
        return
    customer = Customer.objects.select_for_update().get(pk=sale.customer_id)
    outstanding_before = max(
        Decimal('0'),
        sale.total - sale.amount_paid - (sale.total_returned - refund_total),
    )
    outstanding_after = sale_outstanding(sale)
    reduction = outstanding_before - outstanding_after
    if reduction > 0:
        reduction_base = _debt_delta_in_base(reduction, sale.exchange_rate_to_base)
        customer.debt = max(Decimal('0'), customer.debt - reduction_base)
        customer.save(update_fields=['debt', 'updated_at'])


def adjust_customer_debt_on_cancel(sale):
    if not sale.customer_id:
        return
    outstanding = sale_outstanding(sale)
    if outstanding <= 0:
        return
    customer = Customer.objects.select_for_update().get(pk=sale.customer_id)
    outstanding_base = _debt_delta_in_base(outstanding, sale.exchange_rate_to_base)
    customer.debt = max(Decimal('0'), customer.debt - outstanding_base)
    customer.save(update_fields=['debt', 'updated_at'])


def apply_payment_to_customer_debt(customer, amount: Decimal, exchange_rate_to_base=Decimal('1')):
    if amount <= 0:
        return
    amount_base = _debt_delta_in_base(amount, exchange_rate_to_base)
    customer.debt = max(Decimal('0'), customer.debt - amount_base)
    customer.save(update_fields=['debt', 'updated_at'])
