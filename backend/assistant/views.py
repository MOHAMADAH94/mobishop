from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from assistant.analytics_service import SUGGESTED_QUESTIONS
from assistant.features import is_ai_assistant_feature_enabled
from assistant.models import ChatMessage, ChatSession, SupportRequest
from assistant.serializers import (
    ChatRequestSerializer,
    ChatSessionListSerializer,
    ChatSessionSerializer,
    SupportRequestCreateSerializer,
    SupportRequestSerializer,
)
from assistant.service import process_assistant_message
from core.permissions import HasPermission, HasStoreAccess
from core.store_context import ensure_store_context
from core.throttles import AssistantChatThrottle


QUICK_ACTIONS = [
    {'id': 'store_summary', 'label': '📊 ملخص متجري', 'message': 'ما هو ملخص متجري اليوم؟'},
    {'id': 'inventory', 'label': '📦 المخزون', 'message': 'ما حالة المخزون والمنتجات المنخفضة؟'},
    {'id': 'sales', 'label': '💰 المبيعات', 'message': 'ما أكثر المنتجات مبيعاً هذا الشهر؟'},
    {'id': 'debts', 'label': '👥 ديون العملاء', 'message': 'ما العملاء الذين لديهم ديون مستحقة؟'},
    {'id': 'repairs', 'label': '🔧 الصيانة', 'message': 'ما أوامر الصيانة المتأخرة؟'},
    {'id': 'howto', 'label': '❓ كيف أستخدم موبي شوب؟', 'message': 'كيف أستخدم موبي شوب؟'},
    {'id': 'problem', 'label': '🛠️ لدي مشكلة', 'message': 'لدي مشكلة وأحتاج دعم'},
]


def _assistant_denied():
    return Response(
        {'detail': 'مساعد موبي شوب الذكي غير مفعّل لهذا المتجر.'},
        status=status.HTTP_403_FORBIDDEN,
    )


class SuggestedQuestionsView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('ai_assistant')]

    def get(self, request):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        return Response({
            'questions': SUGGESTED_QUESTIONS,
            'quick_actions': QUICK_ACTIONS,
            'welcome': (
                'مرحباً 👋\n'
                'أنا مساعد موبي شوب الذكي.\n'
                'يمكنني مساعدتك في استخدام موبي شوب، حل المشاكل، وتحليل بيانات متجرك.'
            ),
        })


class ChatSessionListView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('ai_assistant')]

    def get(self, request):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        sessions = ChatSession.objects.filter(
            store=store, user=request.user, is_active=True,
        ).prefetch_related('messages')[:20]
        return Response(ChatSessionListSerializer(sessions, many=True).data)

    def post(self, request):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        session = ChatSession.objects.create(store=store, user=request.user)
        return Response(ChatSessionSerializer(session).data, status=status.HTTP_201_CREATED)


class ChatSessionDetailView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('ai_assistant')]

    def get(self, request, pk):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        try:
            session = ChatSession.objects.prefetch_related('messages').get(
                pk=pk, store=store, user=request.user,
            )
        except ChatSession.DoesNotExist:
            return Response({'detail': 'المحادثة غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ChatSessionSerializer(session).data)

    def delete(self, request, pk):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        updated = ChatSession.objects.filter(pk=pk, store=store, user=request.user).update(is_active=False)
        if not updated:
            return Response({'detail': 'المحادثة غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChatView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('ai_assistant')]
    throttle_classes = [AssistantChatThrottle]

    def post(self, request):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()

        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data['message']
        session_id = serializer.validated_data.get('session_id')
        page_context = (serializer.validated_data.get('page_context') or '')[:120]

        if session_id:
            try:
                session = ChatSession.objects.get(
                    pk=session_id, store=store, user=request.user, is_active=True,
                )
            except ChatSession.DoesNotExist:
                return Response({'detail': 'المحادثة غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            session = ChatSession.objects.create(
                store=store,
                user=request.user,
                title=message[:50],
            )

        # Load prior turns before saving the new user message (avoid duplicating it for the LLM)
        prior = list(
            session.messages.exclude(role=ChatMessage.Role.SYSTEM)
            .order_by('-created_at')[:8]
        )
        history = [
            {'role': m.role, 'content': (m.content or '')[:1200]}
            for m in reversed(prior)
            if m.content
        ]

        ChatMessage.objects.create(session=session, role=ChatMessage.Role.USER, content=message)

        try:
            result = process_assistant_message(
                store,
                message,
                page_context=page_context,
                user=request.user,
                history=history,
            )
        except Exception:
            result = {
                'answer': (
                    'تعذّر معالجة طلبك حالياً. حاول مرة أخرى أو أنشئ طلب دعم لفريق موبي شوب.'
                ),
                'statistics': {},
                'recommendation': None,
                'category': 'UNKNOWN',
                'can_escalate': True,
                'tools_used': [],
            }

        answer = result.get('answer') or ''
        metadata = {
            'category': result.get('category'),
            'tools_used': result.get('tools_used') or [],
            'can_escalate': bool(result.get('can_escalate')),
            'recommendation': result.get('recommendation'),
        }

        assistant_msg = ChatMessage.objects.create(
            session=session,
            role=ChatMessage.Role.ASSISTANT,
            content=answer,
            metadata=metadata,
        )
        session.updated_at = timezone.now()
        session.save(update_fields=['updated_at'])

        return Response({
            'session_id': session.id,
            'answer': answer,
            'statistics': result.get('statistics') or {},
            'recommendation': result.get('recommendation'),
            'category': result.get('category'),
            'can_escalate': bool(result.get('can_escalate')),
            'message_id': assistant_msg.id,
        })


class SupportRequestCreateView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('ai_assistant')]
    throttle_classes = [AssistantChatThrottle]

    def post(self, request):
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()

        serializer = SupportRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        session = None
        session_id = data.get('session_id')
        if session_id:
            session = ChatSession.objects.filter(
                pk=session_id, store=store, user=request.user,
            ).first()

        summary = (data.get('conversation_summary') or '').strip()
        if not summary and session:
            msgs = session.messages.order_by('-created_at')[:12]
            summary = '\n'.join(
                f'{m.role}: {m.content[:500]}' for m in reversed(list(msgs))
            )
        if not summary:
            summary = f'المشكلة: {data["issue"]}'

        issue_text = (data.get('issue') or '').strip()
        if summary and summary not in issue_text:
            # احتفظ بالتفاصيل كاملة في حقل المشكلة للأدمن
            issue_text = f'{issue_text}\n\n--- ملخص المحادثة ---\n{summary}'[:8000]

        ticket = SupportRequest.objects.create(
            store=store,
            user=request.user,
            session=session,
            subject=(data.get('subject') or issue_text[:80])[:200],
            issue=issue_text,
            conversation_summary=summary[:8000],
            category=(data.get('category') or '')[:40],
            page_context=(data.get('page_context') or '')[:120],
            safe_technical_context={
                'store_id': store.id,
                'store_name': store.name,
                'user_id': request.user.id,
                'username': request.user.get_username(),
                'email': getattr(request.user, 'email', '') or '',
                'phone': getattr(request.user, 'phone', '') or '',
                'role': getattr(getattr(request, 'store_role', None), 'code', None),
                'page_context': (data.get('page_context') or '')[:120],
                'category': (data.get('category') or '')[:40],
            },
        )
        return Response(SupportRequestSerializer(ticket).data, status=status.HTTP_201_CREATED)

    def get(self, request):
        """List current user's support requests for this store."""
        store = ensure_store_context(request)
        if not is_ai_assistant_feature_enabled(store):
            return _assistant_denied()
        qs = SupportRequest.objects.filter(store=store, user=request.user)[:30]
        return Response(SupportRequestSerializer(qs, many=True).data)
