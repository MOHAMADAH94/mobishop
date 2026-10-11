from django.conf import settings
from django.db import models


class ChatSession(models.Model):
    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='chat_sessions')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_sessions',
    )
    title = models.CharField(max_length=200, blank=True, default='محادثة جديدة')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [models.Index(fields=['store', 'user', '-updated_at'])]

    def __str__(self):
        return f'{self.title} — {self.user}'


class ChatMessage(models.Model):
    class Role(models.TextChoices):
        USER = 'user', 'المستخدم'
        ASSISTANT = 'assistant', 'المساعد'
        SYSTEM = 'system', 'النظام'

    session = models.ForeignKey(ChatSession, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=Role.choices)
    content = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f'{self.role}: {self.content[:50]}'


class SupportRequest(models.Model):
    class Status(models.TextChoices):
        OPEN = 'OPEN', 'مفتوح'
        IN_PROGRESS = 'IN_PROGRESS', 'قيد المعالجة'
        RESOLVED = 'RESOLVED', 'محلول'
        CLOSED = 'CLOSED', 'مغلق'

    store = models.ForeignKey('stores.Store', on_delete=models.CASCADE, related_name='support_requests')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='support_requests',
    )
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='support_requests',
    )
    subject = models.CharField(max_length=200, blank=True, default='')
    issue = models.TextField()
    conversation_summary = models.TextField(blank=True, default='')
    category = models.CharField(max_length=40, blank=True, default='')
    page_context = models.CharField(max_length=120, blank=True, default='')
    safe_technical_context = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    admin_notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['store', 'status', '-created_at'])]

    def __str__(self):
        return f'Support #{self.pk} — {self.store_id} — {self.status}'
