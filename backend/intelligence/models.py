from django.db import models


class BusinessRecommendation(models.Model):
    """توصية أو تنبيه تجاري — يُولَّد يومياً بواسطة محرك القرارات."""

    class Severity(models.TextChoices):
        INFO = 'info', 'معلومة'
        WARNING = 'warning', 'تحذير'
        CRITICAL = 'critical', 'حرج'

    class Kind(models.TextChoices):
        ALERT = 'alert', 'تنبيه'
        RECOMMENDATION = 'recommendation', 'توصية'
        OPPORTUNITY = 'opportunity', 'فرصة'

    class Category(models.TextChoices):
        INVENTORY = 'inventory', 'المخزون'
        SALES = 'sales', 'المبيعات'
        CUSTOMER = 'customer', 'العملاء'
        SUPPLIER = 'supplier', 'الموردون'
        REPAIR = 'repair', 'الصيانة'
        PROFIT = 'profit', 'الأرباح'
        EXPENSE = 'expense', 'المصاريف'

    class EntityType(models.TextChoices):
        PRODUCT = 'product', 'منتج'
        CUSTOMER = 'customer', 'عميل'
        SUPPLIER = 'supplier', 'مورد'
        REPAIR = 'repair', 'صيانة'
        NONE = '', '—'

    store = models.ForeignKey(
        'stores.Store',
        on_delete=models.CASCADE,
        related_name='business_recommendations',
    )
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.INFO)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.RECOMMENDATION)
    category = models.CharField(max_length=20, choices=Category.choices)
    title = models.CharField(max_length=255)
    reason = models.TextField()
    suggested_action = models.TextField()
    entity_type = models.CharField(
        max_length=20,
        choices=EntityType.choices,
        blank=True,
        default='',
    )
    entity_id = models.PositiveIntegerField(null=True, blank=True)
    entity_name = models.CharField(max_length=200, blank=True)
    fingerprint = models.CharField(max_length=64, db_index=True)
    is_dismissed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    generated_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-generated_at']
        indexes = [
            models.Index(fields=['store', 'is_active', 'is_dismissed']),
            models.Index(fields=['store', 'fingerprint']),
        ]
        unique_together = ('store', 'fingerprint')

    def __str__(self):
        return f'{self.title} ({self.get_severity_display()})'


class RecommendationRunLog(models.Model):
    """سجل آخر تشغيل لمحرك التوصيات لكل متجر."""

    store = models.OneToOneField(
        'stores.Store',
        on_delete=models.CASCADE,
        related_name='recommendation_run_log',
    )
    last_run_at = models.DateTimeField()
    recommendations_count = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f'{self.store.name} — {self.last_run_at}'
