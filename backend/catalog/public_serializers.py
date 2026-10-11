from rest_framework import serializers


class PublicCatalogStoreSerializer(serializers.Serializer):
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField()
    logo_url = serializers.CharField(allow_null=True)
    banner_url = serializers.CharField(allow_null=True)
    contact_phone = serializers.CharField()
    whatsapp = serializers.CharField()
    telegram = serializers.CharField()
    address = serializers.CharField(allow_blank=True)
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    currency = serializers.CharField()
    show_prices = serializers.BooleanField()


class PublicCatalogCategorySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)
    featured = serializers.BooleanField()
    products_count = serializers.IntegerField()


class PublicCatalogProductSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    catalog_slug = serializers.CharField(required=False, allow_blank=True)
    name = serializers.CharField()
    description = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)
    category_name = serializers.CharField()
    category_slug = serializers.CharField()
    sell_price = serializers.CharField(allow_null=True)
    in_stock = serializers.BooleanField()
    is_offer = serializers.BooleanField()
