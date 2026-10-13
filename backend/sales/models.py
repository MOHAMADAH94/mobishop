from decimal import Decimal

from django.conf import settings
from django.db import models


class Sale(models.Model):
    class Status(models.TextChoices):
        COMPLETED = 'completed', 'مكتمل'
        PARTIALLY_RETURNED = 'partially_returned', 'مرتجع جزئي'
        CANCELLED = 'cancelled', 'ملغي'

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        CARD = 'card', 'بطاقة'
        BANK_TRANSFER = 'bank_transfer', 'تحويل بنكي'
        E_WALLET = 'e_wallet', 'محفظة إلكترونية'
        ELECTRONIC = 'electronic', 'دفع إلكتروني'
        PARTIAL = 'partial', 'آجل / جزئي'
        OTHER = 'other', 'أخرى'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='sales')
    invoice_number = models.CharField(max_length=50)
    currency = models.CharField(max_length=10, default='USD')
    exchange_rate_to_base = models.DecimalField(
        max_digits=24,
        decimal_places=10,
        default=1,
        help_text='سعر الصرف وقت الإنشاء: 1 وحدة عملة الفاتورة = X من العملة الأساسية',
    )
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='sales',
    )
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.COMPLETED)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    subtotal = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    total_returned = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    notes = models.TextField(blank=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار الفاتورة عند المزامنة دون اتصال',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='sales_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('store', 'invoice_number')
        indexes = [models.Index(fields=['store', '-created_at'])]
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_sale_client_request_per_store',
            ),
        ]

    @property
    def net_total(self):
        return self.total - self.total_returned

    def __str__(self):
        return self.invoice_number


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        related_name='sale_items',
    )
    product_name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, blank=True)
    imei = models.CharField(max_length=20, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    quantity_returned = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    unit_price = models.DecimalField(max_digits=14, decimal_places=4)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    line_total = models.DecimalField(max_digits=14, decimal_places=4)

    @property
    def quantity_available_to_return(self):
        return max(0, self.quantity - self.quantity_returned)

    def save(self, *args, **kwargs):
        self.line_total = (self.unit_price * self.quantity) - self.discount
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.product_name} x{self.quantity}'


class SaleReturn(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='sale_returns')
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='returns')
    return_number = models.CharField(max_length=50)
    refund_amount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.return_number


class SaleReturnItem(models.Model):
    sale_return = models.ForeignKey(SaleReturn, on_delete=models.CASCADE, related_name='items')
    sale_item = models.ForeignKey(SaleItem, on_delete=models.CASCADE, related_name='return_lines')
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    refund_amount = models.DecimalField(max_digits=14, decimal_places=4)

    def __str__(self):
        return f'{self.sale_item.product_name} x{self.quantity}'


class SalePayment(models.Model):
    """دفعة على فاتورة (عند البيع أو إكمال المتبقي)."""

    class Method(models.TextChoices):
        CASH = 'cash', 'نقدي'
        CARD = 'card', 'بطاقة'
        BANK_TRANSFER = 'bank_transfer', 'تحويل بنكي'
        E_WALLET = 'e_wallet', 'محفظة إلكترونية'
        ELECTRONIC = 'electronic', 'دفع إلكتروني'
        OTHER = 'other', 'أخرى'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='sale_payments')
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=14, decimal_places=4)
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.sale.invoice_number} +{self.amount}'
