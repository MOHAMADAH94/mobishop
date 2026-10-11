from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone


class Store(models.Model):
    class BusinessType(models.TextChoices):
        MOBILE = 'mobile', 'محلات موبايلات'
        ACCESSORIES = 'accessories', 'إكسسوارات'
        MIXED = 'mixed', 'مختلط'

    name = models.CharField(max_length=200)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='owned_stores',
    )
    business_type = models.CharField(
        max_length=20,
        choices=BusinessType.choices,
        default=BusinessType.MOBILE,
    )
    currency = models.CharField(
        max_length=10,
        default='USD',
        help_text='العملة الأساسية للمتجر (المخزون والتقارير)',
    )
    phone = models.CharField(max_length=20, blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to='store_logos/', blank=True, null=True)
    catalog_enabled = models.BooleanField(
        default=False,
        help_text='تفعيل ميزة store catalog المتجر — يتحكم بها مدير النظام فقط',
    )
    store_app_enabled = models.BooleanField(
        default=False,
        help_text='تفعيل ميزة تطبيق متجرك (Android APK) — يتحكم بها مدير النظام فقط',
    )
    ai_assistant_enabled = models.BooleanField(
        default=True,
        help_text='تفعيل مساعد موبي شوب الذكي (ai_smart_assistant) — يتحكم بها مدير النظام',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


class StoreCurrency(models.Model):
    """عملة مفعّلة في المتجر مع سعر صرفها مقابل العملة الأساسية."""

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='currencies')
    code = models.CharField(max_length=10)
    rate_to_base = models.DecimalField(
        max_digits=24,
        decimal_places=10,
        default=Decimal('1'),
        help_text='1 وحدة من هذه العملة = X من العملة الأساسية',
    )
    is_active = models.BooleanField(default=True)
    opening_cash_balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal('0'),
        help_text='رصيد افتتاحي للصندوق النقدي بهذه العملة',
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='currency_updates',
    )

    class Meta:
        unique_together = ('store', 'code')
        ordering = ['code']

    def __str__(self):
        return f'{self.store.name} — {self.code}'


class StoreSettings(models.Model):
    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='settings')
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=15)
    low_stock_threshold = models.PositiveIntegerField(default=5)
    invoice_footer = models.TextField(blank=True, default='')
    invoice_prefix = models.CharField(max_length=10, default='INV')

    def __str__(self):
        return f'إعدادات {self.store.name}'


class Subscription(models.Model):
    class Status(models.TextChoices):
        TRIAL = 'trial', 'تجريبي'
        ACTIVE = 'active', 'نشط'
        EXPIRED = 'expired', 'منتهي'

    store = models.OneToOneField(Store, on_delete=models.CASCADE, related_name='subscription')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.store.name} - {self.status}'


class Role(models.Model):
    class Code(models.TextChoices):
        OWNER = 'owner', 'مالك'
        MANAGER = 'manager', 'مدير'
        CASHIER = 'cashier', 'كاشير'
        TECHNICIAN = 'technician', 'فني صيانة'

    code = models.CharField(max_length=20, choices=Code.choices, unique=True)
    name = models.CharField(max_length=50)
    permissions = models.JSONField(default=list, blank=True)

    def __str__(self):
        return self.name


class StoreRolePermission(models.Model):
    """تخصيص صلاحيات الدور لكل متجر (يحددها المالك)."""

    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='role_permissions')
    role = models.ForeignKey(Role, on_delete=models.CASCADE, related_name='store_permissions')
    permissions = models.JSONField(default=list)

    class Meta:
        unique_together = ('store', 'role')

    def __str__(self):
        return f'{self.store} — {self.role.code}'


class StoreMembership(models.Model):
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='memberships')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='store_memberships',
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name='memberships')
    is_active = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('store', 'user')
        indexes = [models.Index(fields=['user', 'is_active'])]

    def __str__(self):
        return f'{self.user} @ {self.store} ({self.role})'


class Employee(models.Model):
    store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='employees')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='employments',
    )
    membership = models.OneToOneField(
        StoreMembership,
        on_delete=models.CASCADE,
        related_name='employee_profile',
    )
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hire_date = models.DateField(default=timezone.localdate)
    notes = models.TextField(blank=True)

    class Meta:
        unique_together = ('store', 'user')

    def __str__(self):
        return str(self.user)
