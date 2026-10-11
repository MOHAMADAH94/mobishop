from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0003_alter_store_currency'),
    ]

    operations = [
        migrations.AlterField(
            model_name='storesettings',
            name='invoice_footer',
            field=models.TextField(blank=True, default=''),
        ),
    ]
