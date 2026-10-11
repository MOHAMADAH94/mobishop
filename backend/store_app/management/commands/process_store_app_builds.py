from django.core.management.base import BaseCommand

from store_app.builder import process_build
from store_app.models import StoreAppBuild


class Command(BaseCommand):
    help = 'Process pending Store App APK builds (cron / build worker).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=3)
        parser.add_argument('--id', type=int, default=None, help='Process a specific build id')

    def handle(self, *args, **options):
        if options['id']:
            process_build(options['id'])
            self.stdout.write(self.style.SUCCESS(f'Processed build {options["id"]}'))
            return

        qs = (
            StoreAppBuild.objects.filter(status=StoreAppBuild.Status.PENDING)
            .order_by('created_at')[: options['limit']]
        )
        ids = list(qs.values_list('id', flat=True))
        if not ids:
            self.stdout.write('No pending builds.')
            return
        for build_id in ids:
            self.stdout.write(f'Building {build_id}...')
            process_build(build_id)
        self.stdout.write(self.style.SUCCESS(f'Done ({len(ids)} builds).'))
