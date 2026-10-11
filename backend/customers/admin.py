from django.contrib import admin

from customers.models import Customer


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'phone', 'store', 'debt', 'is_active')
    list_filter = ('store', 'is_active')
    search_fields = ('name', 'phone')
