from django.core.management.base import BaseCommand

from intelligence.decision_engine import refresh_store_recommendations
from stores.models import Store


class Command(BaseCommand):
    help = 'توليد توصيات مركز القرارات لجميع المتاجر (يُشغَّل يومياً عبر cron)'

    def add_arguments(self, parser):
        parser.add_argument('--store-id', type=int, help='متجر محدد فقط')

    def handle(self, *args, **options):
        stores = Store.objects.filter(is_active=True)
        if options.get('store_id'):
            stores = stores.filter(id=options['store_id'])

        total = 0
        for store in stores:
            count = refresh_store_recommendations(store)
            total += count
            self.stdout.write(f'  store #{store.id}: {count} recommendations')

        self.stdout.write(self.style.SUCCESS(f'Done — {total} recommendations for {stores.count()} store(s)'))
