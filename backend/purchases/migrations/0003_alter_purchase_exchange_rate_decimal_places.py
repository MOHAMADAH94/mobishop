from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0002_purchase_currency'),
        ('stores', '0010_alter_rate_decimal_places'),
    ]

    operations = [
        migrations.AlterField(
            model_name='purchase',
            name='exchange_rate_to_base',
            field=models.DecimalField(decimal_places=10, default=1, max_digits=24),
        ),
    ]
