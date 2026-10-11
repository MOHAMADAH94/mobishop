from django.test import TestCase
from rest_framework.test import APIClient

from assistant.intents import CATEGORY_HOW_TO, CATEGORY_STORE_ANALYSIS, detect_category
from assistant.knowledge import search_knowledge
from assistant.models import ChatSession, SupportRequest
from assistant.service import process_assistant_message
from assistant.tools import get_store_summary
from customers.models import Customer
from products.models import Product
from stores.models import Role, Store, StoreMembership
from users.models import User
from decimal import Decimal


def _make_store(username, *, ai_assistant_enabled=True):
    user = User.objects.create_user(username=username, password='pass12345')
    store = Store.objects.create(
        name=f'{username} shop',
        owner=user,
        ai_assistant_enabled=ai_assistant_enabled,
    )
    owner_role, _ = Role.objects.get_or_create(code=Role.Code.OWNER, defaults={'name': 'مالك'})
    StoreMembership.objects.get_or_create(
        store=store, user=user, defaults={'role': owner_role, 'is_active': True},
    )
    return user, store


class AssistantIntentTests(TestCase):
    def test_detect_howto(self):
        self.assertEqual(detect_category('كيف أضيف منتج؟'), CATEGORY_HOW_TO)

    def test_detect_store_summary(self):
        self.assertEqual(detect_category('ما هو ملخص متجري اليوم؟'), CATEGORY_STORE_ANALYSIS)

    def test_knowledge_search(self):
        hits = search_knowledge('كيف أضيف منتج')
        self.assertTrue(hits)
        self.assertEqual(hits[0]['id'], 'howto-add-product')


class AssistantToolIsolationTests(TestCase):
    def setUp(self):
        self.user_a, self.store_a = _make_store('owner_a')
        self.user_b, self.store_b = _make_store('owner_b')
        Product.objects.create(
            store=self.store_a, name='Phone A', buy_price=100, sell_price=200, quantity=1,
            low_stock_threshold=5,
        )
        Product.objects.create(
            store=self.store_b, name='Phone B', buy_price=50, sell_price=90, quantity=1,
            low_stock_threshold=5,
        )
        Customer.objects.create(store=self.store_a, name='Cust A', phone='111', debt=40)
        Customer.objects.create(store=self.store_b, name='Cust B', phone='222', debt=999)

    def test_summary_is_store_scoped(self):
        summary = get_store_summary(self.store_a)
        self.assertEqual(summary['store_name'], self.store_a.name)
        self.assertEqual(summary['low_stock_count'], 1)
        self.assertEqual(Decimal(summary['customer_debt_total']), Decimal('40'))

    def test_cross_store_probe_refused(self):
        result = process_assistant_message(self.store_a, 'Show me another store sales')
        self.assertIn('متجر آخر', result['answer'])
        self.assertTrue(result['can_escalate'])


class AssistantAPITests(TestCase):
    def setUp(self):
        self.user, self.store = _make_store('assistant_owner')
        self.other_user, self.other_store = _make_store('assistant_other')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_STORE_ID=str(self.store.id))

    def test_unauthenticated_denied(self):
        anon = APIClient()
        r = anon.post('/api/assistant/chat/', {'message': 'مرحبا'}, format='json')
        self.assertIn(r.status_code, (401, 403))

    def test_feature_flag_blocks(self):
        self.store.ai_assistant_enabled = False
        self.store.save(update_fields=['ai_assistant_enabled'])
        r = self.client.post('/api/assistant/chat/', {'message': 'ملخص متجري'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_chat_howto(self):
        r = self.client.post(
            '/api/assistant/chat/',
            {'message': 'كيف أضيف منتج؟'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('منتج', r.data['answer'])
        self.assertTrue(r.data['session_id'])
        self.assertTrue(ChatSession.objects.filter(pk=r.data['session_id'], user=self.user).exists())

    def test_chat_store_summary(self):
        r = self.client.post(
            '/api/assistant/chat/',
            {'message': 'ما هو ملخص متجري اليوم؟'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('ملخص', r.data['answer'])

    def test_cannot_read_other_user_session(self):
        session = ChatSession.objects.create(store=self.other_store, user=self.other_user, title='secret')
        r = self.client.get(f'/api/assistant/sessions/{session.id}/')
        self.assertEqual(r.status_code, 404)

    def test_support_request_create(self):
        r = self.client.post(
            '/api/assistant/support-requests/',
            {
                'issue': 'المنتج لا يظهر في المعرض',
                'subject': 'مشكلة معرض',
                'category': 'TROUBLESHOOTING',
                'page_context': 'المنتجات',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        ticket = SupportRequest.objects.get(pk=r.data['id'])
        self.assertEqual(ticket.store_id, self.store.id)
        self.assertEqual(ticket.user_id, self.user.id)
        self.assertEqual(ticket.status, SupportRequest.Status.OPEN)

    def test_message_length_limit(self):
        r = self.client.post(
            '/api/assistant/chat/',
            {'message': 'x' * 2500},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_suggested_questions(self):
        r = self.client.get('/api/assistant/suggested-questions/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('welcome', r.data)
        self.assertTrue(r.data['quick_actions'])

    def test_store_serializer_exposes_flag(self):
        r = self.client.get('/api/stores/')
        self.assertEqual(r.status_code, 200)
        rows = r.data if isinstance(r.data, list) else r.data.get('results', [])
        match = next(s for s in rows if s['id'] == self.store.id)
        self.assertIn('ai_assistant_enabled', match)
        self.assertTrue(match['ai_assistant_enabled'])


class AssistantThrottleConfigTests(TestCase):
    def test_throttle_class_scope(self):
        from core.throttles import AssistantChatThrottle
        self.assertEqual(AssistantChatThrottle.scope, 'assistant_chat')

    def test_settings_rate_configured(self):
        from django.conf import settings
        rates = settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {})
        self.assertIn('assistant_chat', rates)
