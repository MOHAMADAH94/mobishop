from decimal import Decimal

from purchases.models import Supplier
from stores.currency_service import amount_in_base


def purchase_outstanding(purchase) -> Decimal:
    return max(Decimal('0'), purchase.total - purchase.amount_paid)


def adjust_supplier_balance_on_cancel(purchase):
    if not purchase.supplier_id:
        return
    outstanding = purchase_outstanding(purchase)
    if outstanding <= 0:
        return
    supplier = Supplier.objects.select_for_update().get(pk=purchase.supplier_id)
    outstanding_base = amount_in_base(outstanding, purchase.exchange_rate_to_base)
    supplier.balance = max(Decimal('0'), supplier.balance - outstanding_base)
    supplier.save(update_fields=['balance', 'updated_at'])


def apply_payment_to_supplier_balance(supplier, amount: Decimal, exchange_rate_to_base=Decimal('1')):
    if amount <= 0:
        return
    amount_base = amount_in_base(amount, exchange_rate_to_base)
    supplier.balance = max(Decimal('0'), supplier.balance - amount_base)
    supplier.save(update_fields=['balance', 'updated_at'])
