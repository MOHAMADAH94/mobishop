from django.db import migrations


def forwards(apps, schema_editor):
    Sale = apps.get_model('sales', 'Sale')
    Sale.objects.filter(payment_method='card').update(payment_method='electronic')


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0004_alter_sale_payment_method_salepayment'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
