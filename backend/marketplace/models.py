from django.db import models


class MarketplaceView(models.Model):
    """تتبع مشاهدات السوق العام — جاهز للتوسع لاحقاً."""

    class EventType(models.TextChoices):
        STORE = 'store', 'متجر'
        PRODUCT = 'product', 'منتج'

    event_type = models.CharField(max_length=20, choices=EventType.choices)
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='marketplace_views')
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='marketplace_views',
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', 'event_type', '-created_at']),
            models.Index(fields=['product', '-created_at']),
        ]
