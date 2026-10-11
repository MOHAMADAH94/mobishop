from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0009_fix_inverted_soft_currency_rates'),
    ]

    operations = [
        migrations.AlterField(
            model_name='storecurrency',
            name='rate_to_base',
            field=models.DecimalField(
                decimal_places=10,
                default=1,
                help_text='1 وحدة من هذه العملة = X من العملة الأساسية',
                max_digits=24,
            ),
        ),
    ]
