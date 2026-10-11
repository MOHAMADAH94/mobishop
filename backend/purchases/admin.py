from django.contrib import admin

from purchases.models import Purchase, PurchaseItem, PurchasePayment, Supplier


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ('name', 'store', 'phone', 'balance', 'is_active')
    list_filter = ('is_active', 'store')
    search_fields = ('name', 'phone')


class PurchaseItemInline(admin.TabularInline):
    model = PurchaseItem
    extra = 0


@admin.register(Purchase)
class PurchaseAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'store', 'supplier', 'total', 'status', 'created_at')
    list_filter = ('status', 'payment_method', 'store')
    search_fields = ('invoice_number', 'supplier__name')
    inlines = [PurchaseItemInline]


@admin.register(PurchasePayment)
class PurchasePaymentAdmin(admin.ModelAdmin):
    list_display = ('purchase', 'amount', 'method', 'created_at')
