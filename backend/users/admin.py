from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, Q
from django.utils.html import format_html

from users.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = (
        'username', 'email', 'first_name', 'last_name',
        'owned_stores_count', 'active_memberships', 'is_staff', 'is_active', 'reports_link',
    )
    list_filter = BaseUserAdmin.list_filter
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('معلومات إضافية', {'fields': ('phone', 'avatar')}),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(
            _owned=Count('owned_stores', distinct=True),
            _mem=Count('store_memberships', filter=Q(store_memberships__is_active=True), distinct=True),
        )

    @admin.display(description='متاجر يملكها', ordering='_owned')
    def owned_stores_count(self, obj):
        return getattr(obj, '_owned', '—')

    @admin.display(description='عضويات نشطة', ordering='_mem')
    def active_memberships(self, obj):
        return getattr(obj, '_mem', '—')

    @admin.display(description='التقارير')
    def reports_link(self, obj):
        return format_html(
            '<a href="{}?user={}">تقرير الارتباطات</a>',
            '/admin/platform-reports/',
            obj.pk,
        )
