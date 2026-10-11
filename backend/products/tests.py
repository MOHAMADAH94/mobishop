from django.test import TestCase
from rest_framework.test import APIClient

from products.models import Category, Product
from stores.models import Role, Store, StoreMembership
from users.models import User


def _make_store(username, *, catalog_enabled=True):
    user = User.objects.create_user(username=username, password='pass12345')
    store = Store.objects.create(
        name=f'{username} shop',
        owner=user,
        catalog_enabled=catalog_enabled,
    )
    owner_role, _ = Role.objects.get_or_create(code=Role.Code.OWNER, defaults={'name': 'مالك'})
    StoreMembership.objects.get_or_create(
        store=store, user=user, defaults={'role': owner_role, 'is_active': True},
    )
    return user, store


class ProductBulkTests(TestCase):
    def setUp(self):
        self.user, self.store = _make_store('owner_bulk')
        self.other_user, self.other_store = _make_store('other_bulk')
        self.cat = Category.objects.create(store=self.store, name='هواتف')
        self.p1 = Product.objects.create(
            store=self.store, name='iPhone', buy_price=100, sell_price=200, quantity=2,
        )
        self.p2 = Product.objects.create(
            store=self.store, name='Samsung', buy_price=80, sell_price=150, quantity=3,
        )
        self.foreign = Product.objects.create(
            store=self.other_store, name='Foreign', buy_price=10, sell_price=20, quantity=1,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.client.credentials(HTTP_X_STORE_ID=str(self.store.id))

    def test_bulk_publish_catalog(self):
        r = self.client.post(
            '/api/products/bulk/',
            {'ids': [self.p1.id, self.p2.id], 'action': 'publish_catalog'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['updated'], 2)
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertTrue(self.p1.publish_in_catalog)
        self.assertTrue(self.p2.publish_in_catalog)

    def test_bulk_cannot_touch_other_store(self):
        r = self.client.post(
            '/api/products/bulk/',
            {'ids': [self.foreign.id], 'action': 'publish_catalog'},
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['updated'], 0)
        self.foreign.refresh_from_db()
        self.assertFalse(self.foreign.publish_in_catalog)

    def test_bulk_set_category(self):
        r = self.client.post(
            '/api/products/bulk/',
            {'ids': [self.p1.id], 'action': 'set_category', 'category_id': self.cat.id},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.category_id, self.cat.id)

    def test_bulk_catalog_requires_feature(self):
        self.store.catalog_enabled = False
        self.store.save(update_fields=['catalog_enabled'])
        r = self.client.post(
            '/api/products/bulk/',
            {'ids': [self.p1.id], 'action': 'publish_catalog'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_create_ignores_is_active_false(self):
        r = self.client.post(
            '/api/products/',
            {
                'name': 'Forced Active',
                'buy_price': '10',
                'sell_price': '20',
                'quantity': 1,
                'is_active': False,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        product = Product.objects.get(pk=r.data['id'])
        self.assertTrue(product.is_active)
        self.assertTrue(r.data.get('is_active', True))

    def test_bulk_activate_restores_inactive(self):
        Product.objects.filter(pk=self.p1.pk).update(is_active=False)
        r = self.client.post(
            '/api/products/bulk/',
            {'ids': [self.p1.id], 'action': 'activate'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['updated'], 1)
        self.p1.refresh_from_db()
        self.assertTrue(self.p1.is_active)


class PrivateApkMediaTests(TestCase):
    def test_apk_media_path_is_blocked(self):
        client = APIClient()
        r = client.get('/media/store_apps/apks/store2-v1.apk')
        self.assertEqual(r.status_code, 403)


class StoreUpdatePermissionTests(TestCase):
    def setUp(self):
        self.owner, self.store = _make_store('owner_settings')
        cashier_role, _ = Role.objects.get_or_create(code=Role.Code.CASHIER, defaults={'name': 'كاشير'})
        self.cashier = User.objects.create_user(username='cashier_bulk', password='pass12345')
        StoreMembership.objects.create(
            store=self.store, user=self.cashier, role=cashier_role, is_active=True,
        )
        self.client = APIClient()

    def test_cashier_cannot_patch_store(self):
        self.client.force_authenticate(user=self.cashier)
        self.client.credentials(HTTP_X_STORE_ID=str(self.store.id))
        r = self.client.patch('/api/stores/current/', {'name': 'Hacked'}, format='json')
        self.assertEqual(r.status_code, 403)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'owner_settings shop')

    def test_owner_can_patch_store_but_not_is_active(self):
        self.client.force_authenticate(user=self.owner)
        self.client.credentials(HTTP_X_STORE_ID=str(self.store.id))
        r = self.client.patch(
            '/api/stores/current/',
            {'name': 'New Name', 'is_active': False},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.store.refresh_from_db()
        self.assertEqual(self.store.name, 'New Name')
        self.assertTrue(self.store.is_active)
