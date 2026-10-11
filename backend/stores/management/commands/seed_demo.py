from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from customers.models import Customer
from products.models import Category, Product
from stores.models import Store

User = get_user_model()

DEMO_PRODUCTS = [
    ('آيفون 15 برو', 'IP15P', '5901234567890', '3500', '4200', 5),
    ('سامسونج S24', 'SS24', '5901234567891', '2800', '3400', 8),
    ('شاحن سريع 65W', 'CHG65', '5901234567892', '45', '89', 25),
    ('سماعة AirPods', 'APODS', '5901234567893', '350', '599', 12),
    ('كفر سيليكون', 'CASE01', '5901234567894', '15', '35', 50),
]


class Command(BaseCommand):
    help = 'إنشاء بيانات تجريبية لمتجر'

    def add_arguments(self, parser):
        parser.add_argument('--email', default='demo@mobishop.com')
        parser.add_argument('--password', default='Demo1234!')

    def handle(self, *args, **options):
        user, created = User.objects.get_or_create(
            username='demo',
            defaults={
                'email': options['email'],
                'first_name': 'تجريبي',
                'last_name': 'متجر',
            },
        )
        if created:
            user.set_password(options['password'])
            user.save()
            self.stdout.write(self.style.SUCCESS(f'Created user: demo / {options["password"]}'))

        store, _ = Store.objects.get_or_create(
            name='متجر تجريبي',
            owner=user,
            defaults={'business_type': 'mobile', 'currency': 'USD'},
        )

        cat, _ = Category.objects.get_or_create(store=store, name='هواتف')
        Category.objects.get_or_create(store=store, name='إكسسوارات')

        for name, sku, barcode, buy, sell, qty in DEMO_PRODUCTS:
            Product.objects.update_or_create(
                store=store,
                sku=sku,
                defaults={
                    'name': name,
                    'barcode': barcode,
                    'buy_price': Decimal(buy),
                    'sell_price': Decimal(sell),
                    'quantity': qty,
                    'category': cat if 'آيفون' in name or 'سامسونج' in name else None,
                },
            )

        Customer.objects.get_or_create(
            store=store, phone='0500000000',
            defaults={'name': 'عميل تجريبي', 'email': 'customer@demo.com'},
        )

        self.stdout.write(self.style.SUCCESS(f'Demo data ready for store id={store.id}'))
