from decimal import Decimal

from django.db import migrations, models


def backfill_repair_currency(apps, schema_editor):
    RepairOrder = apps.get_model('repairs', 'RepairOrder')
    for order in RepairOrder.objects.select_related('store').iterator():
        store_currency = (order.store.currency or 'USD').strip().upper()
        RepairOrder.objects.filter(pk=order.pk).update(
            currency=store_currency,
            exchange_rate_to_base=Decimal('1'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('repairs', '0001_initial'),
        ('stores', '0008_storecurrency_alter_store_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='repairorder',
            name='currency',
            field=models.CharField(default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='repairorder',
            name='exchange_rate_to_base',
            field=models.DecimalField(decimal_places=6, default=1, max_digits=18),
        ),
        migrations.RunPython(backfill_repair_currency, migrations.RunPython.noop),
    ]
