from django.db import models
from rest_framework import serializers

from catalog.features import is_catalog_feature_enabled
from catalog.models import StoreCatalogProfile


class StoreCatalogProfileSerializer(serializers.ModelSerializer):
    catalog_enabled = serializers.BooleanField(source='store.catalog_enabled', read_only=True)
    public_url = serializers.SerializerMethodField()
    catalog_logo_url = serializers.SerializerMethodField()
    banner_url = serializers.SerializerMethodField()
    store_logo_url = serializers.SerializerMethodField()

    class Meta:
        model = StoreCatalogProfile
        fields = (
            'catalog_enabled',
            'is_public',
            'slug',
            'catalog_logo',
            'catalog_logo_url',
            'banner',
            'banner_url',
            'store_logo_url',
            'description',
            'contact_phone',
            'whatsapp',
            'telegram',
            'address',
            'latitude',
            'longitude',
            'show_prices',
            'show_out_of_stock',
            'public_url',
            'updated_at',
        )
        read_only_fields = ('catalog_enabled', 'updated_at')
        extra_kwargs = {
            'catalog_logo': {'write_only': True, 'required': False},
            'banner': {'write_only': True, 'required': False},
            'latitude': {'required': False, 'allow_null': True},
            'longitude': {'required': False, 'allow_null': True},
            'address': {'required': False, 'allow_blank': True},
        }

    def _abs(self, request, field):
        if not field:
            return None
        url = field.url
        if request and url.startswith('/'):
            return request.build_absolute_uri(url)
        return url

    def get_catalog_logo_url(self, obj):
        request = self.context.get('request')
        if obj.catalog_logo:
            return self._abs(request, obj.catalog_logo)
        if obj.store.logo:
            return self._abs(request, obj.store.logo)
        return None

    def get_banner_url(self, obj):
        request = self.context.get('request')
        return self._abs(request, obj.banner) if obj.banner else None

    def get_store_logo_url(self, obj):
        request = self.context.get('request')
        return self._abs(request, obj.store.logo) if obj.store.logo else None

    def get_public_url(self, obj):
        if not obj.slug or not obj.is_public:
            return None
        return f'/shop/{obj.slug}'

    def to_internal_value(self, data):
        # FormData sends empty strings; DecimalField rejects '' even with allow_null.
        if hasattr(data, 'copy'):
            data = data.copy()
        else:
            data = dict(data)
        for key in ('latitude', 'longitude'):
            if key in data and data.get(key) in ('', 'null', 'undefined'):
                data[key] = None
        return super().to_internal_value(data)

    def validate_slug(self, value):
        if not value:
            return None
        slug = StoreCatalogProfile.normalize_slug(value)
        if not slug:
            raise serializers.ValidationError('المعرّف (slug) مطلوب.')
        qs = StoreCatalogProfile.objects.filter(slug=slug)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('هذا المعرّف مستخدم من متجر آخر.')
        return slug

    def validate_latitude(self, value):
        if value is None or value == '':
            return None
        try:
            lat = float(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError('خط العرض غير صالح.')
        if lat < -90 or lat > 90:
            raise serializers.ValidationError('خط العرض يجب أن يكون بين -90 و 90.')
        return lat

    def validate_longitude(self, value):
        if value is None or value == '':
            return None
        try:
            lng = float(value)
        except (TypeError, ValueError):
            raise serializers.ValidationError('خط الطول غير صالح.')
        if lng < -180 or lng > 180:
            raise serializers.ValidationError('خط الطول يجب أن يكون بين -180 و 180.')
        return lng

    def validate(self, attrs):
        store = self.instance.store if self.instance else self.context.get('store')
        if store and not is_catalog_feature_enabled(store):
            raise serializers.ValidationError('ميزة store catalog المتجر غير مفعّلة لهذا المتجر.')
        if attrs.get('is_public') and not (attrs.get('slug') or (self.instance and self.instance.slug)):
            raise serializers.ValidationError({'slug': 'أدخل معرّفاً للمتجر قبل النشر.'})
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None) if self.instance else None)
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None) if self.instance else None)
        if (lat is None) != (lng is None):
            raise serializers.ValidationError('أدخل خط العرض وخط الطول معاً، أو اتركهما فارغين.')
        return attrs
