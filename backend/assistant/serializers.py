from rest_framework import serializers

from assistant.models import ChatMessage, ChatSession, SupportRequest


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'role', 'content', 'metadata', 'created_at']
        read_only_fields = fields


class ChatSessionSerializer(serializers.ModelSerializer):
    messages = ChatMessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'is_active', 'created_at', 'updated_at', 'messages', 'message_count']
        read_only_fields = ['id', 'created_at', 'updated_at', 'messages', 'message_count']

    def get_message_count(self, obj):
        return obj.messages.count()


class ChatSessionListSerializer(serializers.ModelSerializer):
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = ChatSession
        fields = ['id', 'title', 'is_active', 'created_at', 'updated_at', 'message_count', 'last_message']

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_last_message(self, obj):
        last = obj.messages.order_by('-created_at').first()
        if last:
            return {'content': last.content[:100], 'role': last.role, 'created_at': last.created_at}
        return None


class ChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000)
    session_id = serializers.IntegerField(required=False, allow_null=True)
    page_context = serializers.CharField(required=False, allow_blank=True, max_length=120)


class SupportRequestCreateSerializer(serializers.Serializer):
    issue = serializers.CharField(max_length=8000)
    subject = serializers.CharField(required=False, allow_blank=True, max_length=200)
    session_id = serializers.IntegerField(required=False, allow_null=True)
    conversation_summary = serializers.CharField(required=False, allow_blank=True, max_length=8000)
    category = serializers.CharField(required=False, allow_blank=True, max_length=40)
    page_context = serializers.CharField(required=False, allow_blank=True, max_length=120)


class SupportRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportRequest
        fields = [
            'id', 'subject', 'issue', 'conversation_summary', 'category',
            'page_context', 'status', 'created_at', 'updated_at',
        ]
        read_only_fields = fields
