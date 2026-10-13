from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.db.models import Count, Q
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.html import format_html

from users.models import User
from users.services import PurgeBlocked, preview_user_purge, purge_user_account


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
    actions = ('purge_accounts_with_stores',)

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

    @admin.action(description='حذف الحساب والمتاجر المرتبطة نهائياً')
    def purge_accounts_with_stores(self, request, queryset):
        """حذف ذري: المتاجر المملوكة + بياناتها ثم المستخدم (مناسب للحسابات التجريبية)."""
        if not request.user.is_superuser:
            self.message_user(
                request,
                'هذا الإجراء متاح لمديري النظام فقط.',
                level=messages.ERROR,
            )
            return

        action_name = 'purge_accounts_with_stores'
        back_url = reverse('admin:users_user_changelist')

        if request.POST.get('apply'):
            confirm = (request.POST.get('confirm_text') or '').strip()
            if confirm != 'DELETE':
                self.message_user(
                    request,
                    'لم يتم الحذف: يجب كتابة DELETE للتأكيد.',
                    level=messages.ERROR,
                )
                return redirect(back_url)

            delete_orphans = request.POST.get('delete_orphan_members') == '1'
            ok = 0
            for user in queryset:
                try:
                    result = purge_user_account(
                        user,
                        actor=request.user,
                        delete_orphan_members=delete_orphans,
                    )
                except PurgeBlocked as exc:
                    self.message_user(
                        request,
                        f'«{user.username}»: {exc}',
                        level=messages.ERROR,
                    )
                    continue
                stores_n = len(result.deleted_store_ids)
                orphans_n = len(result.deleted_orphan_usernames)
                self.message_user(
                    request,
                    f'تم حذف «{result.username}» مع {stores_n} متجر'
                    + (f' و{orphans_n} حساب عضو يتيم' if orphans_n else '')
                    + '.',
                    level=messages.SUCCESS,
                )
                ok += 1
            if ok == 0:
                self.message_user(request, 'لم يُحذف أي حساب.', level=messages.WARNING)
            return None

        previews = []
        blocked = []
        purgable = []
        for user in queryset:
            preview = preview_user_purge(user, actor=request.user, delete_orphan_members=True)
            if preview.can_purge:
                previews.append(preview)
                purgable.append(user)
            else:
                blocked.append({'username': user.username, 'reason': preview.blocked_reason})

        context = {
            **self.admin_site.each_context(request),
            'title': 'تأكيد الحذف النهائي',
            'queryset': purgable,
            'previews': previews,
            'blocked': blocked,
            'opts': self.model._meta,
            'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
            'action_name': action_name,
            'back_url': back_url,
        }
        return TemplateResponse(
            request,
            'admin/users/purge_user_confirmation.html',
            context,
        )
