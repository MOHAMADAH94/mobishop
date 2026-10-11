from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Create Django admin superuser (for /admin/) if none exists'

    def add_arguments(self, parser):
        parser.add_argument('--username', default='admin')
        parser.add_argument('--password', default='Admin1234!')
        parser.add_argument('--email', default='admin@mobishop.online')

    def handle(self, *args, **options):
        User = get_user_model()
        username = options['username']

        if User.objects.filter(is_superuser=True).exists():
            user = User.objects.filter(is_superuser=True).first()
            self.stdout.write(f'Superuser already exists: {user.username}')
            return

        if User.objects.filter(username=username).exists():
            user = User.objects.get(username=username)
            user.is_staff = True
            user.is_superuser = True
            user.set_password(options['password'])
            user.save(update_fields=['is_staff', 'is_superuser', 'password'])
            self.stdout.write(self.style.SUCCESS(f'Promoted existing user to admin: {username}'))
            return

        User.objects.create_superuser(username, options['email'], options['password'])
        self.stdout.write(self.style.SUCCESS(f'Created admin user: {username}'))
