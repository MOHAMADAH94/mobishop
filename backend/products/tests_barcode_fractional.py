from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from products.barcode_service import generate_unique_barcode
from products.models import Product
from products.quantity import normalize_product_qty
from stores.models import Role, Store, StoreMembership, Subscription


User = get_user_model()


def _setup_store(username='owner_bf'):
    from stores.models import StoreSettings

    user = User.objects.create_user(username=username, password='pass12345')
    store = Store.objects.create(name='BF Store', owner=user, currency='USD')
    Subscription.objects.get_or_create(store=store)
    settings, _ = StoreSettings.objects.get_or_create(store=store)
    settings.tax_rate = 0
    settings.save(update_fields=['tax_rate'])
    owner_role, _ = Role.objects.get_or_create(code='owner', defaults={'name': 'مالك'})
    StoreMembership.objects.get_or_create(
        store=store, user=user, defaults={'role': owner_role, 'is_active': True},
    )
    client = APIClient()
    client.force_authenticate(user=user)
    client.credentials(HTTP_X_STORE_ID=str(store.id))
    return user, store, client


class BarcodeTests(TestCase):
    def setUp(self):
        self.user, self.store, self.client = _setup_store()
        self.product = Product.objects.create(
            store=self.store, name='Phone', buy_price=100, sell_price=200, quantity=5,
        )

    def test_generate_barcode_unique(self):
        code = generate_unique_barcode(self.store, self.product)
        self.assertTrue(code)
        self.product.refresh_from_db()
        self.assertEqual(self.product.barcode, code)

    def test_duplicate_barcode_rejected(self):
        self.product.barcode = 'BC-DUP-1'
        self.product.save(update_fields=['barcode'])
        r = self.client.post(
            '/api/products/',
            {
                'name': 'Other',
                'buy_price': '10',
                'sell_price': '20',
                'quantity': 1,
                'barcode': 'BC-DUP-1',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_generate_barcode_api(self):
        r = self.client.post(f'/api/products/{self.product.id}/generate-barcode/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['generated'])
        self.product.refresh_from_db()
        self.assertEqual(self.product.barcode, r.data['barcode'])

    def test_lookup_by_barcode(self):
        self.product.barcode = 'LOOKUP999'
        self.product.save(update_fields=['barcode'])
        r = self.client.get('/api/products/lookup/', {'code': 'LOOKUP999'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['id'], self.product.id)


class FractionalQtyTests(TestCase):
    def setUp(self):
        self.user, self.store, self.client = _setup_store('owner_frac')
        self.normal = Product.objects.create(
            store=self.store, name='Normal', buy_price=10, sell_price=20, quantity=10,
            allow_fractional_quantity=False,
        )
        self.frac = Product.objects.create(
            store=self.store, name='Balance', buy_price=0, sell_price=1, quantity=100,
            allow_fractional_quantity=True, quantity_precision=2, unit='رصيد',
        )

    def test_normal_rejects_fraction(self):
        with self.assertRaises(ValueError):
            normalize_product_qty(self.normal, '1.5')

    def test_fractional_accepts_decimal(self):
        qty = normalize_product_qty(self.frac, '12.5')
        self.assertEqual(qty, Decimal('12.500'))

    def test_sale_fractional_updates_stock(self):
        r = self.client.post(
            '/api/sales/create/',
            {
                'payment_method': 'cash',
                'payments': [{'method': 'cash', 'amount': '12.50'}],
                'items': [{'product_id': self.frac.id, 'quantity': '12.5', 'unit_price': '1'}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        self.frac.refresh_from_db()
        self.assertEqual(self.frac.quantity, Decimal('87.500'))

    def test_sale_rejects_fraction_on_normal(self):
        r = self.client.post(
            '/api/sales/create/',
            {
                'payment_method': 'cash',
                'items': [{'product_id': self.normal.id, 'quantity': '1.5', 'unit_price': '20'}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)


class SplitPaymentTests(TestCase):
    def setUp(self):
        self.user, self.store, self.client = _setup_store('owner_pay')
        self.product = Product.objects.create(
            store=self.store, name='Item', buy_price=50, sell_price=100, quantity=10,
        )
        from customers.models import Customer
        self.customer = Customer.objects.create(store=self.store, name='Cust', phone='1')

    def test_split_cash_and_card(self):
        r = self.client.post(
            '/api/sales/create/',
            {
                'payment_method': 'cash',
                'payments': [
                    {'method': 'cash', 'amount': '40'},
                    {'method': 'card', 'amount': '60'},
                ],
                'items': [{'product_id': self.product.id, 'quantity': 1, 'unit_price': '100'}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        from sales.models import Sale, SalePayment
        sale = Sale.objects.get(pk=r.data['id'])
        self.assertEqual(sale.amount_paid, Decimal('100.00'))
        self.assertEqual(SalePayment.objects.filter(sale=sale).count(), 2)

    def test_split_with_credit_requires_customer(self):
        r = self.client.post(
            '/api/sales/create/',
            {
                'payments': [{'method': 'cash', 'amount': '40'}],
                'items': [{'product_id': self.product.id, 'quantity': 1, 'unit_price': '100'}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_split_with_credit_ok(self):
        r = self.client.post(
            '/api/sales/create/',
            {
                'customer_id': self.customer.id,
                'payments': [{'method': 'cash', 'amount': '40'}],
                'items': [{'product_id': self.product.id, 'quantity': 1, 'unit_price': '100'}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        from sales.models import Sale
        sale = Sale.objects.get(pk=r.data['id'])
        self.assertEqual(sale.payment_method, Sale.PaymentMethod.PARTIAL)
        self.assertEqual(sale.amount_paid, Decimal('40.00'))
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.debt, Decimal('60.00'))
