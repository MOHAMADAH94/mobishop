from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Convert MySQL tables to utf8mb4 (required for Arabic text on shared hosting)'

    def handle(self, *args, **options):
        if connection.vendor != 'mysql':
            self.stdout.write('Skipped: not MySQL')
            return

        with connection.cursor() as cursor:
            cursor.execute('SELECT DATABASE()')
            db_name = cursor.fetchone()[0]
            cursor.execute(
                f'ALTER DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
            )
            cursor.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
                """
            )
            tables = [row[0] for row in cursor.fetchall()]

        converted = 0
        with connection.cursor() as cursor:
            for table in tables:
                cursor.execute(
                    f'ALTER TABLE `{table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
                )
                converted += 1

        self.stdout.write(self.style.SUCCESS(f'Converted {converted} table(s) to utf8mb4'))
