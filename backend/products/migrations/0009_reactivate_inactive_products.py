from django.db import migrations


def reactivate_all_products(apps, schema_editor):
    Product = apps.get_model('products', 'Product')
    Product.objects.filter(is_active=False).update(is_active=True)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0008_client_request_id'),
    ]

    operations = [
        migrations.RunPython(reactivate_all_products, noop_reverse),
    ]
