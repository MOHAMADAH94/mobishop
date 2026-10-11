from decimal import Decimal

from django.db import migrations, models


def backfill_expense_currency(apps, schema_editor):
    Expense = apps.get_model('expenses', 'Expense')
    for expense in Expense.objects.select_related('store').iterator():
        store_currency = (expense.store.currency or 'USD').strip().upper()
        Expense.objects.filter(pk=expense.pk).update(
            currency=store_currency,
            exchange_rate_to_base=Decimal('1'),
        )


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0001_initial'),
        ('stores', '0008_storecurrency_alter_store_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='currency',
            field=models.CharField(default='USD', max_length=10),
        ),
        migrations.AddField(
            model_name='expense',
            name='exchange_rate_to_base',
            field=models.DecimalField(decimal_places=6, default=1, max_digits=18),
        ),
        migrations.RunPython(backfill_expense_currency, migrations.RunPython.noop),
    ]
