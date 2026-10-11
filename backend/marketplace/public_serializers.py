from rest_framework import serializers


class MarketplaceStoreCardSerializer(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)
    banner_url = serializers.CharField(allow_null=True)
    products_count = serializers.IntegerField()
    featured = serializers.BooleanField()
    joined_at = serializers.CharField()
    contact_phone = serializers.CharField()
    whatsapp = serializers.CharField()
    telegram = serializers.CharField()


class MarketplaceProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    catalog_slug = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)
    category_name = serializers.CharField()
    category_slug = serializers.CharField()
    sell_price = serializers.CharField(allow_null=True)
    in_stock = serializers.BooleanField()
    is_offer = serializers.BooleanField()
    store_name = serializers.CharField()
    store_slug = serializers.CharField()
    store_logo_url = serializers.CharField(allow_null=True)


class MarketplaceCategoryFilterSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    products_count = serializers.IntegerField()
