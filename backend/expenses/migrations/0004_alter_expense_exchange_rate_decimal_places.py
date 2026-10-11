from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0003_merge_20260611_expense_currency_and_index_rename'),
        ('stores', '0010_alter_rate_decimal_places'),
    ]

    operations = [
        migrations.AlterField(
            model_name='expense',
            name='exchange_rate_to_base',
            field=models.DecimalField(decimal_places=10, default=1, max_digits=24),
        ),
    ]
