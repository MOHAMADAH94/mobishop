from django.conf import settings
from django.db import models


import re

from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='categories')
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=80, blank=True, null=True, allow_unicode=True)
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='category_images/', blank=True, null=True)
    show_in_catalog = models.BooleanField(default=True)
    featured = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'categories'
        unique_together = ('store', 'name')
        ordering = ['-featured', 'sort_order', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'slug'],
                condition=models.Q(slug__isnull=False) & ~models.Q(slug=''),
                name='unique_category_slug_per_store',
            ),
        ]

    def __str__(self):
        return self.name

    @staticmethod
    def normalize_slug(value: str) -> str:
        value = (value or '').strip().lower()
        value = slugify(value, allow_unicode=True)
        value = re.sub(r'[^a-z0-9\u0600-\u06FF-]', '-', value)
        value = re.sub(r'-+', '-', value).strip('-')
        return value[:80]

    def save(self, *args, **kwargs):
        if self.slug:
            self.slug = self.normalize_slug(self.slug) or None
        elif self.name and not self.pk:
            self.slug = self.normalize_slug(self.name) or None
        super().save(*args, **kwargs)


class Product(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='products')
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products',
    )
    name = models.CharField(max_length=200)
    sku = models.CharField(max_length=50, blank=True)
    barcode = models.CharField(max_length=100, blank=True)
    imei = models.CharField(max_length=20, blank=True)
    buy_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    sell_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    low_stock_threshold = models.DecimalField(max_digits=14, decimal_places=3, default=5)
    allow_fractional_quantity = models.BooleanField(
        default=False,
        help_text='السماح ببيع كميات كسرية (مثل 1.5) — المنتجات الحالية تبقى صحيحة',
    )
    quantity_precision = models.PositiveSmallIntegerField(
        default=0,
        help_text='عدد المنازل العشرية المسموحة (0–3) عند تفعيل الكميات الكسرية',
    )
    unit = models.CharField(
        max_length=30,
        blank=True,
        default='',
        help_text='وحدة القياس الاختيارية (قطعة، متر، كغ، رصيد…)',
    )
    description = models.TextField(blank=True)
    image = models.ImageField(upload_to='product_images/', blank=True, null=True)
    publish_in_catalog = models.BooleanField(default=False)
    is_catalog_offer = models.BooleanField(default=False)
    catalog_slug = models.SlugField(max_length=120, blank=True, null=True, unique=True, allow_unicode=True)
    is_active = models.BooleanField(default=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار إنشاء المنتج عند المزامنة دون اتصال',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['store', 'sku']),
            models.Index(fields=['store', 'barcode']),
            models.Index(fields=['store', 'name']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_product_client_request_per_store',
            ),
            models.UniqueConstraint(
                fields=['store', 'barcode'],
                condition=~models.Q(barcode=''),
                name='unique_product_barcode_per_store',
            ),
        ]

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_threshold

    @staticmethod
    def normalize_catalog_slug(value: str) -> str:
        value = (value or '').strip().lower()
        value = slugify(value, allow_unicode=True)
        value = re.sub(r'[^a-z0-9\u0600-\u06FF-]', '-', value)
        value = re.sub(r'-+', '-', value).strip('-')
        return value[:100]

    def ensure_catalog_slug(self):
        if self.catalog_slug:
            self.catalog_slug = self.normalize_catalog_slug(self.catalog_slug) or None
            return
        base = self.normalize_catalog_slug(self.name) or 'product'
        slug = f'{base}-{self.pk}' if self.pk else base
        n = 2
        while Product.objects.filter(catalog_slug=slug).exclude(pk=self.pk).exists():
            slug = f'{base}-{self.pk or n}-{n}'[:120]
            n += 1
        self.catalog_slug = slug[:120]

    def save(self, *args, **kwargs):
        is_new = self.pk is None
        # منتج جديد دائماً نشط — التعطيل فقط عبر حذف ناعم / bulk deactivate
        if is_new:
            self.is_active = True
        super().save(*args, **kwargs)
        if is_new or not self.catalog_slug:
            self.ensure_catalog_slug()
            Product.objects.filter(pk=self.pk).update(catalog_slug=self.catalog_slug)

    def __str__(self):
        return self.name


class InventoryLog(models.Model):
    class Action(models.TextChoices):
        ADD = 'add', 'إضافة'
        REMOVE = 'remove', 'حذف'
        SALE = 'sale', 'بيع'
        ADJUST = 'adjust', 'تعديل'
        RETURN = 'return', 'مرتجع'
        PURCHASE = 'purchase', 'شراء'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='inventory_logs')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='inventory_logs')
    action = models.CharField(max_length=20, choices=Action.choices)
    quantity_before = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_change = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_after = models.DecimalField(max_digits=14, decimal_places=3)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)
    client_request_id = models.CharField(
        max_length=64,
        blank=True,
        null=True,
        help_text='معرّف فريد من العميل لمنع تكرار تسوية المخزون عند المزامنة دون اتصال',
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['store', 'client_request_id'],
                condition=models.Q(client_request_id__isnull=False) & ~models.Q(client_request_id=''),
                name='unique_inventory_log_client_request_per_store',
            ),
        ]

    def __str__(self):
        return f'{self.product.name} {self.action} {self.quantity_change}'
