from django.contrib import admin

from store_app.builder import enqueue_build
from store_app.models import StoreAppBuild


@admin.register(StoreAppBuild)
class StoreAppBuildAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'store', 'app_name', 'status', 'version_name', 'version_code',
        'created_at', 'duration_display', 'apk_link',
    )
    list_filter = ('status',)
    search_fields = ('app_name', 'store__name', 'package_name', 'store_url')
    readonly_fields = (
        'store', 'requested_by', 'store_url', 'package_name', 'version_name',
        'version_code', 'apk_file', 'error_message', 'technical_error',
        'created_at', 'started_at', 'completed_at',
    )
    actions = ('cancel_pending', 'retry_failed', 'delete_apk_files')

    @admin.display(description='المدة (ث)')
    def duration_display(self, obj):
        return obj.duration_seconds if obj.duration_seconds is not None else '—'

    @admin.display(description='APK')
    def apk_link(self, obj):
        if obj.apk_file:
            return 'متوفر — التحميل من لوحة المتجر'
        return '—'

    @admin.action(description='إلغاء المحدد (قيد الانتظار)')
    def cancel_pending(self, request, queryset):
        queryset.filter(status=StoreAppBuild.Status.PENDING).update(
            status=StoreAppBuild.Status.CANCELLED,
        )

    @admin.action(description='إعادة محاولة الفاشل')
    def retry_failed(self, request, queryset):
        for build in queryset.filter(status=StoreAppBuild.Status.FAILED):
            build.status = StoreAppBuild.Status.PENDING
            build.error_message = ''
            build.technical_error = ''
            build.started_at = None
            build.completed_at = None
            build.save(update_fields=[
                'status', 'error_message', 'technical_error', 'started_at', 'completed_at',
            ])
            enqueue_build(build.pk)

    @admin.action(description='حذف ملفات APK القديمة')
    def delete_apk_files(self, request, queryset):
        for build in queryset:
            if build.apk_file:
                build.apk_file.delete(save=False)
                build.apk_file = None
                build.save(update_fields=['apk_file'])
