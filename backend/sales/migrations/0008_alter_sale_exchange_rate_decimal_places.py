from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0007_sale_currency'),
        ('stores', '0010_alter_rate_decimal_places'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sale',
            name='exchange_rate_to_base',
            field=models.DecimalField(
                decimal_places=10,
                default=1,
                help_text='سعر الصرف وقت الإنشاء: 1 وحدة عملة الفاتورة = X من العملة الأساسية',
                max_digits=24,
            ),
        ),
    ]
