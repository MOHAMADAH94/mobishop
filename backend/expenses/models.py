from django.conf import settings
from django.db import models


class Expense(models.Model):
    class Category(models.TextChoices):
        RENT = 'rent', 'إيجار'
        SALARY = 'salary', 'رواتب'
        UTILITIES = 'utilities', 'خدمات'
        SUPPLIES = 'supplies', 'مستلزمات'
        MARKETING = 'marketing', 'تسويق'
        MAINTENANCE = 'maintenance', 'صيانة محل'
        OTHER = 'other', 'أخرى'

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'نقدي'
        ELECTRONIC = 'electronic', 'إلكتروني'
        OTHER = 'other', 'أخرى'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='expenses')
    title = models.CharField(max_length=200)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=10, default='USD')
    exchange_rate_to_base = models.DecimalField(max_digits=24, decimal_places=10, default=1)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    expense_date = models.DateField()
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار المصروف عند المزامنة دون اتصال',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_expenses',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-expense_date', '-created_at']
        indexes = [
            models.Index(fields=['store', 'expense_date']),
            models.Index(fields=['store', 'category']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_expense_client_request_per_store',
            ),
        ]

    def __str__(self):
        return f'{self.title} — {self.amount}'
