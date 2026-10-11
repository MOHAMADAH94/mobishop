from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0008_alter_sale_exchange_rate_decimal_places'),
    ]

    operations = [
        migrations.AddField(
            model_name='sale',
            name='client_request_id',
            field=models.CharField(
                blank=True,
                help_text='معرّف فريد من العميل لمنع تكرار الفاتورة عند المزامنة دون اتصال',
                max_length=64,
                null=True,
            ),
        ),
        migrations.AddConstraint(
            model_name='sale',
            constraint=models.UniqueConstraint(
                condition=models.Q(('client_request_id__isnull', False), models.Q(('client_request_id', ''), _negated=True)),
                fields=('store', 'client_request_id'),
                name='unique_sale_client_request_per_store',
            ),
        ),
    ]
