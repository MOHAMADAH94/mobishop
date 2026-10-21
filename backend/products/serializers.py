from rest_framework import serializers

from core.store_context import ensure_store_context
from products.models import Category, InventoryLog, Product
from products.services import adjust_inventory


class CategorySerializer(serializers.ModelSerializer):
    products_count = serializers.SerializerMethodField()
    catalog_products_count = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    image = serializers.ImageField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = Category
        fields = (
            'id', 'name', 'description', 'slug', 'show_in_catalog', 'featured',
            'sort_order', 'parent', 'image', 'image_url', 'products_count',
            'catalog_products_count', 'created_at',
        )
        read_only_fields = ('id', 'created_at')
        extra_kwargs = {
            'slug': {'required': False, 'allow_blank': True, 'allow_null': True},
            'parent': {'required': False, 'allow_null': True},
        }

    def get_products_count(self, obj):
        if hasattr(obj, 'products_count'):
            return obj.products_count
        return obj.products.filter(is_active=True).count()

    def get_catalog_products_count(self, obj):
        if hasattr(obj, 'catalog_products_count'):
            return obj.catalog_products_count
        return obj.products.filter(is_active=True, publish_in_catalog=True).count()

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        url = obj.image.url
        if request and url.startswith('/'):
            return request.build_absolute_uri(url)
        return url

    def validate_slug(self, value):
        if not value:
            return None
        slug = Category.normalize_slug(value)
        if not slug:
            raise serializers.ValidationError('المعرّف (slug) غير صالح.')
        request = self.context.get('request')
        store = ensure_store_context(request) if request else None
        if store:
            qs = Category.objects.filter(store=store, slug=slug)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('هذا المعرّف مستخدم من تصنيف آخر.')
        return slug

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('اسم التصنيف مطلوب.')
        request = self.context.get('request')
        store = ensure_store_context(request) if request else None
        if store:
            qs = Category.objects.filter(store=store, name__iexact=value)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError('هذا التصنيف موجود بالفعل.')
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        store = validated_data.pop('store', None) or (ensure_store_context(request) if request else None)
        if not store:
            raise serializers.ValidationError('لم يتم تحديد المتجر. أعد تحميل الصفحة.')
        if not validated_data.get('slug') and validated_data.get('name'):
            validated_data['slug'] = Category.normalize_slug(validated_data['name']) or None
        return Category.objects.create(store=store, **validated_data)

    def update(self, instance, validated_data):
        if 'slug' in validated_data and not validated_data.get('slug') and validated_data.get('name', instance.name):
            validated_data['slug'] = Category.normalize_slug(validated_data.get('name', instance.name)) or None
        return super().update(instance, validated_data)


class ProductListSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True, default='')
    is_low_stock = serializers.BooleanField(read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = (
            'id', 'name', 'sku', 'barcode', 'imei', 'buy_price', 'sell_price',
            'quantity', 'low_stock_threshold', 'is_low_stock', 'category',
            'category_name', 'is_active', 'image_url', 'publish_in_catalog',
            'is_catalog_offer', 'allow_fractional_quantity', 'quantity_precision',
            'unit', 'created_at',
        )

    def get_image_url(self, obj):
        if not obj.image:
            return None
        request = self.context.get('request')
        url = obj.image.url
        if request and url.startswith('/'):
            return request.build_absolute_uri(url)
        return url


class ProductDetailSerializer(ProductListSerializer):
    class Meta(ProductListSerializer.Meta):
        fields = ProductListSerializer.Meta.fields + ('description', 'updated_at')


class ProductWriteSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(required=False, allow_null=True)
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)

    class Meta:
        model = Product
        fields = (
            'name', 'sku', 'barcode', 'imei', 'buy_price', 'sell_price',
            'quantity', 'low_stock_threshold', 'category', 'description',
            'image', 'publish_in_catalog', 'is_catalog_offer', 'client_request_id',
            'allow_fractional_quantity', 'quantity_precision', 'unit',
        )

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)

    def validate_buy_price(self, value):
        if value < 0:
            raise serializers.ValidationError('سعر الشراء لا يمكن أن يكون سالباً.')
        from stores.currency_service import quantize_price
        return quantize_price(value)

    def validate_sell_price(self, value):
        if value < 0:
            raise serializers.ValidationError('سعر البيع لا يمكن أن يكون سالباً.')
        from stores.currency_service import quantize_price
        return quantize_price(value)

    def validate_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError('الكمية لا يمكن أن تكون سالبة.')
        return value

    def validate_quantity_precision(self, value):
        if value is None:
            return 0
        if value < 0 or value > 4:
            raise serializers.ValidationError('دقة الكمية يجب أن تكون بين 0 و 4.')
        return value

    def validate_barcode(self, value):
        value = (value or '').strip()
        if not value:
            return ''
        store = self.context.get('store')
        qs = Product.objects.filter(store=store, barcode=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('هذا الباركود مستخدم لمنتج آخر في المتجر.')
        return value

    def validate(self, attrs):
        store = self.context.get('store')
        if store:
            store.refresh_from_db(fields=['catalog_enabled', 'is_active'])
        if store and not store.catalog_enabled:
            if attrs.get('publish_in_catalog') or attrs.get('is_catalog_offer'):
                raise serializers.ValidationError(
                    'ميزة store catalog المتجر غير مفعّلة — لا يمكن نشر المنتجات في المعرض.'
                )
            attrs['publish_in_catalog'] = False
            attrs['is_catalog_offer'] = False
        attrs.pop('is_active', None)
        allow = attrs.get(
            'allow_fractional_quantity',
            getattr(self.instance, 'allow_fractional_quantity', False) if self.instance else False,
        )
        if not allow:
            attrs['quantity_precision'] = 0
        return attrs

    def update(self, instance, validated_data):
        from products.quantity import to_qty

        validated_data.pop('is_active', None)
        new_quantity = validated_data.pop('quantity', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if new_quantity is not None:
            change = to_qty(new_quantity) - to_qty(instance.quantity)
            if change != 0:
                adjust_inventory(
                    instance,
                    change,
                    InventoryLog.Action.ADJUST,
                    user=self.context['request'].user,
                    notes='تعديل الكمية من نموذج المنتج',
                )
        return Product.objects.get(pk=instance.pk)

    def create(self, validated_data):
        from django.db import IntegrityError, transaction

        store = self.context.get('store')
        if not store:
            raise serializers.ValidationError('لم يتم تحديد المتجر. أعد تحميل الصفحة وحاول مجدداً.')
        validated_data.pop('is_active', None)
        validated_data['is_active'] = True
        client_request_id = validated_data.get('client_request_id')
        if client_request_id:
            existing = Product.objects.filter(store=store, client_request_id=client_request_id).first()
            if existing:
                existing._idempotent_replay = True
                return existing

        initial_qty = validated_data.pop('quantity', 0) or 0
        validated_data['quantity'] = 0
        try:
            with transaction.atomic():
                product = Product.objects.create(store=store, **validated_data)
        except IntegrityError:
            if client_request_id:
                existing = Product.objects.filter(store=store, client_request_id=client_request_id).first()
                if existing:
                    existing._idempotent_replay = True
                    return existing
            raise
        if initial_qty > 0:
            adjust_inventory(
                product,
                initial_qty,
                InventoryLog.Action.ADD,
                user=self.context['request'].user,
                notes='رصيد افتتاحي',
            )
        return Product.objects.get(pk=product.pk)


class ProductBulkActionSerializer(serializers.Serializer):
    ACTION_CHOICES = (
        ('publish_catalog', 'نشر في المعرض'),
        ('unpublish_catalog', 'إخفاء من المعرض'),
        ('mark_offer', 'تمييز كعرض'),
        ('unmark_offer', 'إلغاء العرض'),
        ('deactivate', 'حذف من القائمة'),
        ('activate', 'استعادة للمنتجات'),
        ('set_category', 'نقل إلى تصنيف'),
    )

    ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        min_length=1,
        max_length=200,
    )
    action = serializers.ChoiceField(choices=ACTION_CHOICES)
    category_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        if attrs['action'] == 'set_category' and not attrs.get('category_id'):
            raise serializers.ValidationError({'category_id': 'اختر تصنيفاً.'})
        return attrs


class InventoryAdjustSerializer(serializers.Serializer):
    quantity_change = serializers.DecimalField(max_digits=14, decimal_places=4)
    action = serializers.ChoiceField(choices=InventoryLog.Action.choices, default=InventoryLog.Action.ADJUST)
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)


class InventoryLogSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = InventoryLog
        fields = (
            'id', 'product', 'product_name', 'action', 'quantity_before',
            'quantity_change', 'quantity_after', 'reference', 'notes',
            'created_by_name', 'created_at',
        )

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '—'
