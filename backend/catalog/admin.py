from django.contrib import admin

from catalog.models import StoreCatalogProfile


@admin.register(StoreCatalogProfile)
class StoreCatalogProfileAdmin(admin.ModelAdmin):
    list_display = ('store', 'slug', 'is_public', 'featured', 'address', 'show_prices', 'updated_at')
    list_filter = ('is_public', 'featured', 'show_prices')
    list_editable = ('featured',)
    search_fields = ('store__name', 'slug', 'address')
    raw_id_fields = ('store',)
    fields = (
        'store',
        'is_public',
        'slug',
        'featured',
        'description',
        'contact_phone',
        'whatsapp',
        'telegram',
        'address',
        'latitude',
        'longitude',
        'catalog_logo',
        'banner',
        'show_prices',
        'show_out_of_stock',
        'updated_at',
    )
    readonly_fields = ('updated_at',)
