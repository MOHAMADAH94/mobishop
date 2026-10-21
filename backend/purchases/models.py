from decimal import Decimal

from django.conf import settings
from django.db import models


class Supplier(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='suppliers')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    balance = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['store', 'name'])]

    def __str__(self):
        return self.name


class Purchase(models.Model):
    class Status(models.TextChoices):
        COMPLETED = 'completed', 'مكتمل'
        CANCELLED = 'cancelled', 'ملغي'

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        ELECTRONIC = 'electronic', 'إلكتروني'
        PARTIAL = 'partial', 'جزئي'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='purchases')
    invoice_number = models.CharField(max_length=50)
    currency = models.CharField(max_length=10, default='USD')
    exchange_rate_to_base = models.DecimalField(max_digits=24, decimal_places=10, default=1)
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='purchases',
    )
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.COMPLETED)
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices, default=PaymentMethod.CASH)
    subtotal = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    discount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    amount_paid = models.DecimalField(max_digits=14, decimal_places=4, default=0)
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
        related_name='purchases_created',
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
                name='unique_purchase_client_request_per_store',
            ),
        ]

    def __str__(self):
        return self.invoice_number


class PurchaseItem(models.Model):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        related_name='purchase_items',
    )
    product_name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    unit_cost = models.DecimalField(max_digits=14, decimal_places=4)
    line_total = models.DecimalField(max_digits=14, decimal_places=4)

    def save(self, *args, **kwargs):
        self.line_total = self.unit_cost * self.quantity
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.product_name} x{self.quantity}'


class PurchasePayment(models.Model):
    class Method(models.TextChoices):
        CASH = 'cash', 'نقدي'
        ELECTRONIC = 'electronic', 'إلكتروني'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='purchase_payments')
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name='payments')
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
        return f'{self.purchase.invoice_number} +{self.amount}'
