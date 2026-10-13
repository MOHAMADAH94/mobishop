from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.html import format_html

from stores.models import Employee, Role, Store, StoreCurrency, StoreMembership, StoreSettings, Subscription
from users.services import purge_store_and_maybe_owner

User = get_user_model()


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = (
        'name', 'owner', 'owner_link', 'business_type', 'currency',
        'active_members', 'employees_count', 'catalog_enabled', 'store_app_enabled',
        'ai_assistant_enabled', 'is_active',
    )
    list_filter = ('business_type', 'is_active', 'catalog_enabled', 'store_app_enabled', 'ai_assistant_enabled')
    list_editable = ('catalog_enabled', 'store_app_enabled', 'ai_assistant_enabled')
    search_fields = ('name', 'owner__username', 'owner__email', 'phone')
    autocomplete_fields = ('owner',)
    list_select_related = ('owner',)
    actions = ('purge_store_and_owner',)

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.annotate(
            _members=Count('memberships', filter=Q(memberships__is_active=True), distinct=True),
            _employees=Count('employees', distinct=True),
        )

    @admin.display(description='المالك (رابط)', ordering='owner__username')
    def owner_link(self, obj):
        return format_html(
            '<a href="{}?user={}">تقرير {}</a>',
            '/admin/platform-reports/',
            obj.owner_id,
            obj.owner.username,
        )

    @admin.display(description='أعضاء نشطون', ordering='_members')
    def active_members(self, obj):
        return getattr(obj, '_members', '—')

    @admin.display(description='موظفون', ordering='_employees')
    def employees_count(self, obj):
        return getattr(obj, '_employees', '—')

    @admin.action(description='حذف المتجر (+ المالك إن لم يعد له متاجر)')
    def purge_store_and_owner(self, request, queryset):
        """
        يحذف المتجر وكل بياناته. إذا لم يعد المالك يملك متاجر/عضويات أخرى
        وليس staff/superuser، يُحذف حسابه أيضاً.
        """
        if not request.user.is_superuser:
            self.message_user(
                request,
                'هذا الإجراء متاح لمديري النظام فقط.',
                level=messages.ERROR,
            )
            return

        action_name = 'purge_store_and_owner'
        back_url = reverse('admin:stores_store_changelist')

        if request.POST.get('apply'):
            confirm = (request.POST.get('confirm_text') or '').strip()
            if confirm != 'DELETE':
                self.message_user(
                    request,
                    'لم يتم الحذف: يجب كتابة DELETE للتأكيد.',
                    level=messages.ERROR,
                )
                return redirect(back_url)

            for store in queryset.select_related('owner'):
                name = store.name
                owner_name = store.owner.username if store.owner_id else '—'
                result = purge_store_and_maybe_owner(
                    store, actor=request.user, delete_owner_if_empty=True,
                )
                if result.get('owner_deleted'):
                    self.message_user(
                        request,
                        f'حُذف المتجر «{name}» والمالك «{result["owner_username"]}».',
                        level=messages.SUCCESS,
                    )
                else:
                    self.message_user(
                        request,
                        f'حُذف المتجر «{name}» (المالك «{owner_name}» بقي لأن له متاجر/عضويات أخرى أو صلاحيات إدارية).',
                        level=messages.SUCCESS,
                    )
            return None

        stores = list(queryset.select_related('owner'))
        context = {
            **self.admin_site.each_context(request),
            'title': 'تأكيد حذف المتجر',
            'queryset': stores,
            'stores': stores,
            'opts': self.model._meta,
            'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
            'action_name': action_name,
            'back_url': back_url,
        }
        return TemplateResponse(
            request,
            'admin/stores/purge_store_confirmation.html',
            context,
        )


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('store', 'status', 'trial_ends_at', 'expires_at')
    list_filter = ('status',)
    search_fields = ('store__name',)
    autocomplete_fields = ('store',)


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    search_fields = ('code', 'name')


@admin.register(StoreMembership)
class StoreMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'store', 'role', 'is_active', 'joined_at', 'reports_link')
    list_filter = ('role', 'is_active')
    search_fields = ('user__username', 'user__email', 'store__name')
    autocomplete_fields = ('user', 'store', 'role')
    list_select_related = ('user', 'store', 'role')

    @admin.display(description='التقارير')
    def reports_link(self, obj):
        return format_html(
            '<a href="{}?user={}&store={}">عرض الارتباط</a>',
            '/admin/platform-reports/',
            obj.user_id,
            obj.store_id,
        )


@admin.register(StoreSettings)
class StoreSettingsAdmin(admin.ModelAdmin):
    list_display = ('store', 'tax_rate', 'low_stock_threshold')
    autocomplete_fields = ('store',)


@admin.register(StoreCurrency)
class StoreCurrencyAdmin(admin.ModelAdmin):
    list_display = ('store', 'code', 'rate_to_base', 'is_active', 'updated_at')
    list_filter = ('is_active', 'code')
    autocomplete_fields = ('store',)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('user', 'store', 'hire_date', 'reports_link')
    search_fields = ('user__username', 'user__email', 'store__name')
    autocomplete_fields = ('user', 'store', 'membership')
    list_select_related = ('user', 'store')

    @admin.display(description='التقارير')
    def reports_link(self, obj):
        return format_html(
            '<a href="{}?user={}&store={}">عرض الارتباط</a>',
            '/admin/platform-reports/',
            obj.user_id,
            obj.store_id,
        )
