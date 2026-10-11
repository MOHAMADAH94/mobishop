from django.core.management import call_command
from django.core.management.base import BaseCommand

from stores.models import Store, StoreSettings
from stores.signals import seed_roles


class Command(BaseCommand):
    help = 'تهيئة الإنتاج: أدوار، عضويات، إعدادات متاجر'

    def add_arguments(self, parser):
        parser.add_argument(
            '--with-demo',
            action='store_true',
            help='إنشاء حساب تجريبي (لا تستخدم على السيرفر العام)',
        )

    def handle(self, *args, **options):
        try:
            call_command('fix_mysql_charset')
        except Exception as exc:
            self.stdout.write(f'fix_mysql_charset skipped: {exc}')

        seed_roles()
        self.stdout.write('Roles seeded')

        for store in Store.objects.all():
            StoreSettings.objects.get_or_create(
                store=store,
                defaults={'invoice_footer': '', 'invoice_prefix': 'INV'},
            )
        self.stdout.write('Store settings ensured')

        try:
            call_command('fix_stores')
        except Exception:
            call_command('fix_memberships')

        if options.get('with_demo'):
            try:
                call_command('seed_demo')
            except Exception as exc:
                self.stdout.write(f'seed_demo skipped: {exc}')
        else:
            self.stdout.write('seed_demo skipped (pass --with-demo to create demo user)')

        self.stdout.write(self.style.SUCCESS('Production setup complete'))
