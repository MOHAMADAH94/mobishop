from decimal import Decimal

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_store_currencies(apps, schema_editor):
    Store = apps.get_model('stores', 'Store')
    StoreCurrency = apps.get_model('stores', 'StoreCurrency')
    for store in Store.objects.all():
        code = (store.currency or 'USD').strip().upper()
        StoreCurrency.objects.get_or_create(
            store=store,
            code=code,
            defaults={'rate_to_base': Decimal('1'), 'is_active': True},
        )


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('stores', '0007_normalize_legacy_role_permissions'),
    ]

    operations = [
        migrations.AlterField(
            model_name='store',
            name='currency',
            field=models.CharField(
                default='USD',
                help_text='العملة الأساسية للمتجر (المخزون والتقارير)',
                max_length=10,
            ),
        ),
        migrations.CreateModel(
            name='StoreCurrency',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=10)),
                ('rate_to_base', models.DecimalField(
                    decimal_places=6,
                    default=Decimal('1'),
                    help_text='1 وحدة من هذه العملة = X من العملة الأساسية',
                    max_digits=18,
                )),
                ('is_active', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('store', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='currencies',
                    to='stores.store',
                )),
                ('updated_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='currency_updates',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['code'],
                'unique_together': {('store', 'code')},
            },
        ),
        migrations.RunPython(seed_store_currencies, migrations.RunPython.noop),
    ]
