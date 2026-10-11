from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0009_reactivate_inactive_products'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='allow_fractional_quantity',
            field=models.BooleanField(
                default=False,
                help_text='السماح ببيع كميات كسرية (مثل 1.5) — المنتجات الحالية تبقى صحيحة',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='quantity_precision',
            field=models.PositiveSmallIntegerField(
                default=0,
                help_text='عدد المنازل العشرية المسموحة (0–3) عند تفعيل الكميات الكسرية',
            ),
        ),
        migrations.AddField(
            model_name='product',
            name='unit',
            field=models.CharField(
                blank=True,
                default='',
                help_text='وحدة القياس الاختيارية (قطعة، متر، كغ، رصيد…)',
                max_length=30,
            ),
        ),
        migrations.AlterField(
            model_name='product',
            name='quantity',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name='product',
            name='low_stock_threshold',
            field=models.DecimalField(decimal_places=3, default=5, max_digits=14),
        ),
        migrations.AlterField(
            model_name='inventorylog',
            name='quantity_before',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
        migrations.AlterField(
            model_name='inventorylog',
            name='quantity_change',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
        migrations.AlterField(
            model_name='inventorylog',
            name='quantity_after',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
        migrations.AddConstraint(
            model_name='product',
            constraint=models.UniqueConstraint(
                condition=~models.Q(barcode=''),
                fields=('store', 'barcode'),
                name='unique_product_barcode_per_store',
            ),
        ),
    ]
