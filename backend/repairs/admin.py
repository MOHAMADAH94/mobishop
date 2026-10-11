from django.contrib import admin

from repairs.models import RepairOrder, RepairPayment


@admin.register(RepairOrder)
class RepairOrderAdmin(admin.ModelAdmin):
    list_display = (
        'ticket_number', 'store', 'customer_name', 'device_model',
        'status', 'total_cost', 'deposit_paid', 'debt_posted',
    )
    list_filter = ('store', 'status', 'debt_posted')


@admin.register(RepairPayment)
class RepairPaymentAdmin(admin.ModelAdmin):
    list_display = ('repair', 'amount', 'method', 'store', 'created_at')
    list_filter = ('method', 'store')
