from django.db.models import ProtectedError
from django.test import TestCase

from products.models import Product
from stores.models import Role, Store, StoreMembership, Subscription
from users.models import User
from users.services import PurgeBlocked, purge_store_and_maybe_owner, purge_user_account


def _make_trial_owner(username):
    user = User.objects.create_user(username=username, password='pass12345')
    store = Store.objects.create(name=f'{username} shop', owner=user)
    Subscription.objects.update_or_create(
        store=store,
        defaults={'status': Subscription.Status.TRIAL},
    )
    owner_role, _ = Role.objects.get_or_create(code=Role.Code.OWNER, defaults={'name': 'مالك'})
    StoreMembership.objects.get_or_create(
        store=store, user=user, defaults={'role': owner_role, 'is_active': True},
    )
    return user, store


class PurgeUserAccountTests(TestCase):
    def test_purge_deletes_store_products_subscription_and_user(self):
        owner, store = _make_trial_owner('trial_owner')
        Product.objects.create(
            store=store, name='Phone', buy_price=10, sell_price=20, quantity=1,
        )
        admin = User.objects.create_superuser('root', 'root@test.com', 'pass12345')

        result = purge_user_account(owner, actor=admin)

        self.assertEqual(result.username, 'trial_owner')
        self.assertEqual(result.deleted_store_ids, [store.pk])
        self.assertFalse(User.objects.filter(username='trial_owner').exists())
        self.assertFalse(Store.objects.filter(pk=store.pk).exists())
        self.assertFalse(Subscription.objects.filter(store_id=store.pk).exists())
        self.assertFalse(Product.objects.filter(store_id=store.pk).exists())

    def test_cannot_delete_user_before_store_due_to_protect(self):
        owner, _store = _make_trial_owner('protect_owner')
        with self.assertRaises(ProtectedError):
            owner.delete()

    def test_blocks_superuser_and_self(self):
        admin = User.objects.create_superuser('root2', 'r2@test.com', 'pass12345')
        with self.assertRaises(PurgeBlocked):
            purge_user_account(admin, actor=admin)

        owner, _ = _make_trial_owner('self_owner')
        with self.assertRaises(PurgeBlocked):
            purge_user_account(owner, actor=owner)

    def test_deletes_orphan_member(self):
        owner, store = _make_trial_owner('owner_orph')
        cashier = User.objects.create_user(username='cashier_orph', password='pass12345')
        role, _ = Role.objects.get_or_create(code=Role.Code.CASHIER, defaults={'name': 'كاشير'})
        StoreMembership.objects.create(store=store, user=cashier, role=role)
        admin = User.objects.create_superuser('root3', 'r3@test.com', 'pass12345')

        result = purge_user_account(owner, actor=admin, delete_orphan_members=True)

        self.assertIn('cashier_orph', result.deleted_orphan_usernames)
        self.assertFalse(User.objects.filter(username='cashier_orph').exists())

    def test_purge_store_deletes_owner_when_empty(self):
        owner, store = _make_trial_owner('store_only')
        admin = User.objects.create_superuser('root4', 'r4@test.com', 'pass12345')

        result = purge_store_and_maybe_owner(store, actor=admin)

        self.assertTrue(result['owner_deleted'])
        self.assertFalse(User.objects.filter(username='store_only').exists())
        self.assertFalse(Store.objects.filter(pk=store.pk).exists())
