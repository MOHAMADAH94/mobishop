# Merge parallel 0002 branches: index rename (server) + currency fields (multi-currency)

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0002_expense_currency'),
        (
            'expenses',
            '0002_rename_expenses_ex_store_i_6a8f0d_idx_expenses_ex_store_i_fa0907_idx_and_more',
        ),
    ]

    operations = []
