from django.contrib import admin

from core.models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('action', 'model_name', 'user', 'store', 'created_at')
    list_filter = ('action', 'store')
    search_fields = ('model_name', 'object_id')
    readonly_fields = ('created_at',)
