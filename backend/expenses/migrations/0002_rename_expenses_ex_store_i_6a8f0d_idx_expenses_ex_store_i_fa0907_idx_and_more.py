# Index rename (auto-generated on production; included for migration graph consistency)

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0001_initial'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='expense',
            new_name='expenses_ex_store_i_fa0907_idx',
            old_name='expenses_ex_store_i_6a8f0d_idx',
        ),
        migrations.RenameIndex(
            model_name='expense',
            new_name='expenses_ex_store_i_2cfa98_idx',
            old_name='expenses_ex_store_i_9c2b1a_idx',
        ),
    ]
