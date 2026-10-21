from decimal import Decimal

from rest_framework import serializers

from purchases.models import Purchase, PurchaseItem, PurchasePayment, Supplier
from purchases.services import create_purchase, record_purchase_payment


class SupplierListSerializer(serializers.ModelSerializer):
    purchases_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = (
            'id', 'name', 'phone', 'email', 'address', 'notes', 'balance',
            'is_active', 'purchases_count', 'created_at',
        )

    def get_purchases_count(self, obj):
        return obj.purchases.exclude(status='cancelled').count()


class SupplierDetailSerializer(SupplierListSerializer):
    recent_purchases = serializers.SerializerMethodField()

    class Meta(SupplierListSerializer.Meta):
        fields = SupplierListSerializer.Meta.fields + ('recent_purchases', 'updated_at')

    def get_recent_purchases(self, obj):
        purchases = obj.purchases.order_by('-created_at')[:10]
        return PurchaseListSerializer(purchases, many=True).data


class SupplierWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ('name', 'phone', 'email', 'address', 'balance', 'notes', 'is_active')


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = (
            'id', 'product', 'product_name', 'sku', 'quantity',
            'unit_cost', 'line_total',
        )


class PurchasePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchasePayment
        fields = ('id', 'amount', 'method', 'notes', 'created_at')


class PurchaseListSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()
    amount_due = serializers.SerializerMethodField()

    class Meta:
        model = Purchase
        fields = (
            'id', 'invoice_number', 'supplier', 'supplier_name', 'status',
            'payment_method', 'currency', 'exchange_rate_to_base',
            'total', 'amount_paid', 'amount_due',
            'created_by_name', 'created_at',
        )

    def get_amount_due(self, obj):
        from purchases.supplier_account import purchase_outstanding
        return str(purchase_outstanding(obj))

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '—'


class PurchaseDetailSerializer(PurchaseListSerializer):
    items = PurchaseItemSerializer(many=True, read_only=True)
    payments = PurchasePaymentSerializer(many=True, read_only=True)

    class Meta(PurchaseListSerializer.Meta):
        fields = PurchaseListSerializer.Meta.fields + (
            'subtotal', 'discount', 'tax_amount', 'notes', 'items', 'payments', 'updated_at',
        )


class RecordPurchasePaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=4)
    method = serializers.ChoiceField(choices=PurchasePayment.Method.choices, default='cash')
    notes = serializers.CharField(required=False, allow_blank=True)

    def create(self, validated_data):
        request = self.context['request']
        purchase = self.context['purchase']
        return record_purchase_payment(
            purchase=purchase,
            amount=validated_data['amount'],
            user=request.user,
            method=validated_data['method'],
            notes=validated_data.get('notes', ''),
        )


class PurchaseItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal('0.0001'))
    unit_cost = serializers.DecimalField(max_digits=14, decimal_places=4, required=False)


class PurchaseCreateSerializer(serializers.Serializer):
    supplier_id = serializers.IntegerField(required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=Purchase.PaymentMethod.choices, default='cash')
    currency = serializers.CharField(required=False, allow_blank=True)
    exchange_rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True,
    )
    discount = serializers.DecimalField(max_digits=14, decimal_places=4, default=0)
    amount_paid = serializers.DecimalField(max_digits=14, decimal_places=4, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)
    items = PurchaseItemInputSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('يجب إضافة منتج واحد على الأقل.')
        return value

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)

    def create(self, validated_data):
        from core.store_context import ensure_store_context
        request = self.context['request']
        store = ensure_store_context(request)
        if not store:
            raise serializers.ValidationError('يجب اختيار متجر.')
        supplier = None
        if validated_data.get('supplier_id'):
            supplier = Supplier.objects.get(pk=validated_data['supplier_id'], store=store)
        return create_purchase(
            store=store,
            user=request.user,
            items_data=validated_data['items'],
            supplier=supplier,
            payment_method=validated_data['payment_method'],
            discount=validated_data['discount'],
            amount_paid=validated_data.get('amount_paid'),
            notes=validated_data.get('notes', ''),
            currency=validated_data.get('currency') or None,
            exchange_rate_override=validated_data.get('exchange_rate'),
            client_request_id=validated_data.get('client_request_id'),
        )
