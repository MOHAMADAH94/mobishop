from decimal import Decimal

from django.db import migrations, models


def backfill_purchase_currency(apps, schema_editor):
    Purchase = apps.get_model('purchases', 'Purchase')
    for purchase in Purchase.objects.select_related('store').iterator():
        store_currency = (purchase.store.currency or 'USD').strip().upper()
        Purchase.objects.filter(pk=purchase.pk).update(
            currency=store_currency,
            exchange_rate_to_base=Decimal('1'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0001_initial'),
        ('stores', '0008_storecurrency_alter_store_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='purchase',
            name='currency',
            field=models.CharField(default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='purchase',
            name='exchange_rate_to_base',
            field=models.DecimalField(decimal_places=6, default=1, max_digits=18),
        ),
        migrations.RunPython(backfill_purchase_currency, migrations.RunPython.noop),
    ]
