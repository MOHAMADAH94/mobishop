from django.conf import settings
from django.db import models


class RepairOrder(models.Model):
    class Status(models.TextChoices):
        RECEIVED = 'received', 'مستلم'
        DIAGNOSING = 'diagnosing', 'تشخيص'
        WAITING_PARTS = 'waiting_parts', 'بانتظار قطع'
        IN_PROGRESS = 'in_progress', 'قيد الإصلاح'
        READY = 'ready', 'جاهز للتسليم'
        DELIVERED = 'delivered', 'تم التسليم'
        CANCELLED = 'cancelled', 'ملغي'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='repair_orders')
    customer = models.ForeignKey(
        'customers.Customer',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_orders',
    )
    ticket_number = models.CharField(max_length=50)
    currency = models.CharField(max_length=10, default='USD')
    exchange_rate_to_base = models.DecimalField(max_digits=24, decimal_places=10, default=1)
    customer_name = models.CharField(max_length=200, blank=True)
    customer_phone = models.CharField(max_length=20, blank=True)
    device_brand = models.CharField(max_length=100, blank=True)
    device_model = models.CharField(max_length=100, blank=True)
    imei = models.CharField(max_length=20, blank=True)
    issue_description = models.TextField()
    diagnosis = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.RECEIVED)
    labor_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    parts_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    deposit_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    debt_posted = models.BooleanField(
        default=False,
        help_text='هل تم ترحيل المتبقي إلى دين العميل عند التسليم',
    )
    debt_posted_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        help_text='المبلغ المرحّل لدين العميل بالعملة الأساسية',
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='repair_assignments',
    )
    received_at = models.DateTimeField(auto_now_add=True)
    estimated_delivery = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار التذكرة عند المزامنة دون اتصال',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='repairs_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('store', 'ticket_number')
        indexes = [models.Index(fields=['store', 'status'])]
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_repair_client_request_per_store',
            ),
        ]

    @property
    def amount_due(self):
        from decimal import Decimal
        return max(Decimal('0'), self.total_cost - self.deposit_paid)

    def save(self, *args, **kwargs):
        self.total_cost = self.labor_cost + self.parts_cost
        super().save(*args, **kwargs)

    def __str__(self):
        return self.ticket_number


class RepairPayment(models.Model):
    """دفعة على تذكرة صيانة (عربون أو إكمال المتبقي)."""

    class Method(models.TextChoices):
        CASH = 'cash', 'نقدي'
        ELECTRONIC = 'electronic', 'إلكتروني'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='repair_payments')
    repair = models.ForeignKey(RepairOrder, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
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
        return f'{self.repair.ticket_number} +{self.amount}'
