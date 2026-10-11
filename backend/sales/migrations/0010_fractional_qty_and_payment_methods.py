from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0009_sale_client_request_id'),
    ]

    operations = [
        migrations.AlterField(
            model_name='sale',
            name='payment_method',
            field=models.CharField(
                choices=[
                    ('cash', 'نقدي'),
                    ('card', 'بطاقة'),
                    ('bank_transfer', 'تحويل بنكي'),
                    ('e_wallet', 'محفظة إلكترونية'),
                    ('electronic', 'دفع إلكتروني'),
                    ('partial', 'آجل / جزئي'),
                    ('other', 'أخرى'),
                ],
                default='cash',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='salepayment',
            name='method',
            field=models.CharField(
                choices=[
                    ('cash', 'نقدي'),
                    ('card', 'بطاقة'),
                    ('bank_transfer', 'تحويل بنكي'),
                    ('e_wallet', 'محفظة إلكترونية'),
                    ('electronic', 'دفع إلكتروني'),
                    ('other', 'أخرى'),
                ],
                default='cash',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='saleitem',
            name='quantity',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
        migrations.AlterField(
            model_name='saleitem',
            name='quantity_returned',
            field=models.DecimalField(decimal_places=3, default=0, max_digits=14),
        ),
        migrations.AlterField(
            model_name='salereturnitem',
            name='quantity',
            field=models.DecimalField(decimal_places=3, max_digits=14),
        ),
    ]
