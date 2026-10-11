from django.db import models


class Customer(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='customers')
    name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    debt = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار السجل عند المزامنة دون اتصال',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['store', 'phone'])]
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_customer_client_request_per_store',
            ),
        ]

    def __str__(self):
        return self.name
