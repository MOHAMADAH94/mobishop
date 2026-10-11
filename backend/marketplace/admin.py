from django.contrib import admin

from marketplace.models import MarketplaceView


@admin.register(MarketplaceView)
class MarketplaceViewAdmin(admin.ModelAdmin):
    list_display = ('event_type', 'store', 'product', 'created_at')
    list_filter = ('event_type', 'created_at')
    raw_id_fields = ('store', 'product')
    date_hierarchy = 'created_at'
