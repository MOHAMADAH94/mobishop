from django.contrib import admin

from products.models import Category, InventoryLog, Product


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'store')
    list_filter = ('store',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'store', 'sku', 'quantity', 'sell_price', 'is_active')
    list_filter = ('store', 'is_active')
    search_fields = ('name', 'sku', 'barcode')


@admin.register(InventoryLog)
class InventoryLogAdmin(admin.ModelAdmin):
    list_display = ('product', 'action', 'quantity_change', 'created_at')
    list_filter = ('action', 'store')
