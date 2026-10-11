from decimal import Decimal

from django.db import migrations, models


def backfill_sale_currency(apps, schema_editor):
    Sale = apps.get_model('sales', 'Sale')
    for sale in Sale.objects.select_related('store').iterator():
        store_currency = (sale.store.currency or 'USD').strip().upper()
        Sale.objects.filter(pk=sale.pk).update(
            currency=store_currency,
            exchange_rate_to_base=Decimal('1'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0006_saleitem_imei'),
        ('stores', '0008_storecurrency_alter_store_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='sale',
            name='currency',
            field=models.CharField(default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='sale',
            name='exchange_rate_to_base',
            field=models.DecimalField(
                decimal_places=6,
                default=1,
                help_text='سعر الصرف وقت الإنشاء: 1 وحدة عملة الفاتورة = X من العملة الأساسية',
                max_digits=18,
            ),
        ),
        migrations.RunPython(backfill_sale_currency, migrations.RunPython.noop),
    ]
