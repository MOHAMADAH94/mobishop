"""Fix inverted exchange rates entered before display_rate UX (soft currency, hard base)."""

from decimal import Decimal

from django.db import migrations

from stores.currencies import is_hard_currency, normalize_currency


def fix_inverted_rates(apps, schema_editor):
    Store = apps.get_model('stores', 'Store')
    StoreCurrency = apps.get_model('stores', 'StoreCurrency')

    for store in Store.objects.all():
        base = normalize_currency(store.currency or 'USD')
        if not is_hard_currency(base):
            continue
        for row in StoreCurrency.objects.filter(store=store).exclude(code=base):
            code = normalize_currency(row.code)
            if is_hard_currency(code):
                continue
            rate = row.rate_to_base
            if rate is None or rate <= 0:
                continue
            if rate >= 1:
                row.rate_to_base = (Decimal('1') / Decimal(rate)).quantize(Decimal('0.000001'))
                row.save(update_fields=['rate_to_base'])


class Migration(migrations.Migration):

    dependencies = [
        ('stores', '0008_storecurrency_alter_store_currency'),
    ]

    operations = [
        migrations.RunPython(fix_inverted_rates, migrations.RunPython.noop),
    ]
