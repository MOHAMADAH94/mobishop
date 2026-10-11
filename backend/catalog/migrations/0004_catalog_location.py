# Generated manually for catalog location fields

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_marketplace'),
    ]

    operations = [
        migrations.AddField(
            model_name='storecatalogprofile',
            name='address',
            field=models.CharField(blank=True, max_length=255, verbose_name='عنوان المحل'),
        ),
        migrations.AddField(
            model_name='storecatalogprofile',
            name='latitude',
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                verbose_name='خط العرض',
            ),
        ),
        migrations.AddField(
            model_name='storecatalogprofile',
            name='longitude',
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                verbose_name='خط الطول',
            ),
        ),
    ]
