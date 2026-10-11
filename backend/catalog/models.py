import re

from django.db import models
from django.utils.text import slugify


class StoreCatalogProfile(models.Model):
    store = models.OneToOneField(
        'stores.Store',
        on_delete=models.CASCADE,
        related_name='catalog_profile',
    )
    is_public = models.BooleanField(default=False, verbose_name='تفعيل الكتالوج العام')
    slug = models.SlugField(max_length=80, unique=True, blank=True, null=True, allow_unicode=True)
    catalog_logo = models.ImageField(upload_to='catalog/logos/', blank=True, null=True)
    banner = models.ImageField(upload_to='catalog/banners/', blank=True, null=True)
    description = models.TextField(blank=True, verbose_name='وصف المتجر')
    contact_phone = models.CharField(max_length=20, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    telegram = models.CharField(max_length=100, blank=True)
    address = models.CharField(max_length=255, blank=True, verbose_name='عنوان المحل')
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        verbose_name='خط العرض',
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        verbose_name='خط الطول',
    )
    show_prices = models.BooleanField(default=True)
    show_out_of_stock = models.BooleanField(default=False)
    featured = models.BooleanField(
        default=False,
        help_text='متجر مميز — يظهر أولاً في السوق العام (Super Admin)',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'catalog file'
        verbose_name_plural = ' catalog files'

    def __str__(self):
        return f'كتalog — {self.store.name}'

    @staticmethod
    def normalize_slug(value: str) -> str:
        value = (value or '').strip().lower()
        value = slugify(value, allow_unicode=True)
        value = re.sub(r'[^a-z0-9\u0600-\u06FF-]', '-', value)
        value = re.sub(r'-+', '-', value).strip('-')
        return value[:80]
