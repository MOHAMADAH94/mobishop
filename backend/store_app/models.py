from django.conf import settings
from django.db import models


class StoreAppBuild(models.Model):
    """Build job for a store-branded Android WebView APK."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'قيد الانتظار'
        BUILDING = 'building', 'جارٍ البناء'
        COMPLETED = 'completed', 'جاهز'
        FAILED = 'failed', 'فشل'
        CANCELLED = 'cancelled', 'ملغى'

    store = models.ForeignKey(
        'stores.Store',
        on_delete=models.CASCADE,
        related_name='app_builds',
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='store_app_builds',
    )
    app_name = models.CharField(max_length=50)
    app_icon = models.ImageField(upload_to='store_apps/icons/', blank=True, null=True)
    store_url = models.URLField(max_length=500)
    primary_color = models.CharField(max_length=7, blank=True, default='#0F766E')
    package_name = models.CharField(max_length=120)
    version_name = models.CharField(max_length=20, default='1.0.0')
    version_code = models.PositiveIntegerField(default=1)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    apk_file = models.FileField(upload_to='store_apps/apks/', blank=True, null=True)
    error_message = models.TextField(blank=True)
    technical_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', 'status']),
        ]

    def __str__(self):
        return f'{self.app_name} ({self.store_id}) — {self.status}'

    @property
    def duration_seconds(self):
        if self.started_at and self.completed_at:
            return max(0, int((self.completed_at - self.started_at).total_seconds()))
        return None
