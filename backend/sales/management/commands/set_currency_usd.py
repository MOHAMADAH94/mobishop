from django.core.management.base import BaseCommand

from stores.models import Store


class Command(BaseCommand):
    help = 'Set all stores currency to USD'

    def handle(self, *args, **options):
        updated = Store.objects.exclude(currency='USD').update(currency='USD')
        self.stdout.write(self.style.SUCCESS(f'Updated {updated} store(s) to USD'))
