from django.contrib import admin

from sales.models import Sale, SaleItem, SaleReturn, SaleReturnItem


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0


class SaleReturnItemInline(admin.TabularInline):
    model = SaleReturnItem
    extra = 0


class SaleReturnInline(admin.TabularInline):
    model = SaleReturn
    extra = 0
    show_change_link = True


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'store', 'total', 'total_returned', 'status', 'created_at')
    list_filter = ('store', 'status', 'payment_method')
    inlines = [SaleItemInline, SaleReturnInline]


@admin.register(SaleReturn)
class SaleReturnAdmin(admin.ModelAdmin):
    list_display = ('return_number', 'sale', 'refund_amount', 'created_at')
    inlines = [SaleReturnItemInline]
