from decimal import Decimal

from repairs.models import RepairOrder
from sales.customer_account import sale_outstanding
from sales.models import Sale
from stores.currency_service import amount_in_base


def get_customer_debt_references(customer):
    """فواتير/تذاكر مرتبطة بدين العميل مع المبلغ المتبقي (بالعملة الأساسية)."""
    refs = []

    sales = (
        Sale.objects.filter(customer=customer, store=customer.store)
        .exclude(status=Sale.Status.CANCELLED)
        .order_by('-created_at')
    )
    for sale in sales:
        due = sale_outstanding(sale)
        if due > 0:
            due_base = amount_in_base(due, sale.exchange_rate_to_base)
            refs.append({
                'type': 'sale',
                'reference': sale.invoice_number,
                'amount_due': str(due_base),
                'amount_due_original': str(due),
                'currency': sale.currency,
                'id': sale.id,
                'date': sale.created_at.isoformat(),
            })

    repairs = (
        RepairOrder.objects.filter(
            customer=customer,
            store=customer.store,
            status=RepairOrder.Status.DELIVERED,
        )
        .exclude(status=RepairOrder.Status.CANCELLED)
        .order_by('-received_at')
    )
    for order in repairs:
        due = order.total_cost - order.deposit_paid
        if due > 0:
            due_base = amount_in_base(due, order.exchange_rate_to_base)
            refs.append({
                'type': 'repair',
                'reference': order.ticket_number,
                'amount_due': str(due_base),
                'amount_due_original': str(due),
                'currency': order.currency,
                'id': order.id,
                'date': order.received_at.isoformat(),
            })

    return refs
