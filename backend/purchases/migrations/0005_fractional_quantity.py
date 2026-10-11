from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('purchases', '0004_client_request_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='purchaseitem',
            name='quantity',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
    ]
