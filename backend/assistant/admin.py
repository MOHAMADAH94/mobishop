from django.contrib import admin

from assistant.models import ChatMessage, ChatSession, SupportRequest


class ChatMessageInline(admin.TabularInline):
    model = ChatMessage
    extra = 0
    readonly_fields = ('role', 'content', 'metadata', 'created_at')
    can_delete = False


@admin.register(ChatSession)
class ChatSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'store', 'user', 'is_active', 'updated_at')
    list_filter = ('is_active', 'store')
    search_fields = ('title', 'user__username')
    inlines = [ChatMessageInline]


@admin.register(SupportRequest)
class SupportRequestAdmin(admin.ModelAdmin):
    list_display = (
        'id', 'subject', 'store', 'user', 'status', 'category',
        'page_context', 'issue_preview', 'created_at',
    )
    list_filter = ('status', 'store', 'category')
    search_fields = (
        'subject', 'issue', 'conversation_summary', 'user__username',
        'user__email', 'store__name', 'page_context',
    )
    readonly_fields = (
        'store', 'user', 'session', 'subject', 'issue', 'conversation_summary',
        'category', 'page_context', 'safe_technical_context',
        'created_at', 'updated_at',
    )
    list_editable = ('status',)
    fields = (
        'store', 'user', 'session', 'subject', 'issue', 'conversation_summary',
        'category', 'page_context', 'status', 'admin_notes',
        'safe_technical_context', 'created_at', 'updated_at',
    )

    @admin.display(description='ملخص المشكلة')
    def issue_preview(self, obj):
        text = (obj.issue or obj.conversation_summary or '').strip()
        return (text[:80] + '…') if len(text) > 80 else text