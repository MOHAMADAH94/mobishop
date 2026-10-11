from django.core.management.base import BaseCommand

from products.models import Product


class Command(BaseCommand):
    help = 'تفعيل كل المنتجات غير النشطة (is_active=False) لجميع المتاجر'

    def add_arguments(self, parser):
        parser.add_argument(
            '--store-id',
            type=int,
            default=None,
            help='تفعيل منتجات متجر واحد فقط (اختياري)',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='عرض العدد دون تعديل',
        )

    def handle(self, *args, **options):
        qs = Product.objects.filter(is_active=False)
        store_id = options.get('store_id')
        if store_id is not None:
            qs = qs.filter(store_id=store_id)

        count = qs.count()
        if options['dry_run']:
            self.stdout.write(self.style.WARNING(f'dry-run: {count} منتج غير مفعّل'))
            return

        updated = qs.update(is_active=True)
        self.stdout.write(self.style.SUCCESS(f'تم تفعيل {updated} منتج'))
