# Generated manually for expenses app

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('stores', '0004_alter_storesettings_invoice_footer'),
    ]

    operations = [
        migrations.CreateModel(
            name='Expense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('category', models.CharField(
                    choices=[
                        ('rent', 'إيجار'),
                        ('salary', 'رواتب'),
                        ('utilities', 'خدمات'),
                        ('supplies', 'مستلزمات'),
                        ('marketing', 'تسويق'),
                        ('maintenance', 'صيانة محل'),
                        ('other', 'أخرى'),
                    ],
                    default='other',
                    max_length=20,
                )),
                ('payment_method', models.CharField(
                    choices=[
                        ('cash', 'نقدي'),
                        ('electronic', 'إلكتروني'),
                        ('other', 'أخرى'),
                    ],
                    default='cash',
                    max_length=20,
                )),
                ('expense_date', models.DateField()),
                ('notes', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='recorded_expenses',
                    to=settings.AUTH_USER_MODEL,
                )),
                ('store', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='expenses',
                    to='stores.store',
                )),
            ],
            options={
                'ordering': ['-expense_date', '-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['store', 'expense_date'], name='expenses_ex_store_i_6a8f0d_idx'),
        ),
        migrations.AddIndex(
            model_name='expense',
            index=models.Index(fields=['store', 'category'], name='expenses_ex_store_i_9c2b1a_idx'),
        ),
    ]
