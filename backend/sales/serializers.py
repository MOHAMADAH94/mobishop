from decimal import Decimal

from rest_framework import serializers

from customers.models import Customer
from sales.models import Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem
from sales.services import create_sale, process_partial_return, record_sale_payment


class SaleItemSerializer(serializers.ModelSerializer):
    quantity_available_to_return = serializers.DecimalField(
        max_digits=14, decimal_places=3, read_only=True,
    )

    class Meta:
        model = SaleItem
        fields = (
            'id', 'product', 'product_name', 'sku', 'imei', 'quantity', 'quantity_returned',
            'quantity_available_to_return', 'unit_price', 'cost_price', 'discount', 'line_total',
        )


class SaleReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='sale_item.product_name', read_only=True)

    class Meta:
        model = SaleReturnItem
        fields = ('id', 'sale_item', 'product_name', 'quantity', 'refund_amount')


class SaleReturnSerializer(serializers.ModelSerializer):
    items = SaleReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = SaleReturn
        fields = ('id', 'return_number', 'refund_amount', 'notes', 'created_at', 'items')


class SalePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalePayment
        fields = ('id', 'amount', 'method', 'notes', 'created_at')


class SaleListSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='')
    created_by_name = serializers.SerializerMethodField()
    net_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    amount_due = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = (
            'id', 'invoice_number', 'customer', 'customer_name', 'status',
            'payment_method', 'currency', 'exchange_rate_to_base',
            'total', 'total_returned', 'net_total', 'amount_paid',
            'amount_due', 'created_by_name', 'created_at',
        )

    def get_amount_due(self, obj):
        from sales.customer_account import sale_outstanding
        return str(sale_outstanding(obj))

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '—'


class SaleDetailSerializer(SaleListSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    returns = SaleReturnSerializer(many=True, read_only=True)
    payments = SalePaymentSerializer(many=True, read_only=True)

    class Meta(SaleListSerializer.Meta):
        fields = SaleListSerializer.Meta.fields + (
            'subtotal', 'discount', 'tax_amount', 'notes', 'items', 'returns',
            'payments', 'updated_at',
        )


class RecordPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.ChoiceField(choices=SalePayment.Method.choices, default='cash')
    notes = serializers.CharField(required=False, allow_blank=True)

    def create(self, validated_data):
        request = self.context['request']
        sale = self.context['sale']
        return record_sale_payment(
            sale=sale,
            amount=validated_data['amount'],
            user=request.user,
            method=validated_data['method'],
            notes=validated_data.get('notes', ''),
        )


class PartialReturnItemSerializer(serializers.Serializer):
    sale_item_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))


class PartialReturnSerializer(serializers.Serializer):
    items = PartialReturnItemSerializer(many=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('حدد منتجاً واحداً على الأقل للإرجاع.')
        return value

    def create(self, validated_data):
        request = self.context['request']
        sale = self.context['sale']
        return process_partial_return(
            sale=sale,
            user=request.user,
            items_data=validated_data['items'],
            notes=validated_data.get('notes', ''),
        )


class SaleItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.DecimalField(max_digits=14, decimal_places=3, min_value=Decimal('0.001'))
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)


class SalePaymentInputSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=SalePayment.Method.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0'))


class SaleCreateSerializer(serializers.Serializer):
    customer_id = serializers.IntegerField(required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=Sale.PaymentMethod.choices, default='cash')
    payments = SalePaymentInputSerializer(many=True, required=False)
    currency = serializers.CharField(required=False, allow_blank=True)
    display_exchange_rate = serializers.DecimalField(
        max_digits=18, decimal_places=4, required=False, allow_null=True,
    )
    exchange_rate = serializers.DecimalField(
        max_digits=18, decimal_places=10, required=False, allow_null=True,
    )
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_paid = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)
    items = SaleItemInputSerializer(many=True)

    def validate_discount(self, value):
        from stores.currency_service import quantize_money
        return quantize_money(value)

    def validate_amount_paid(self, value):
        if value is None:
            return value
        from stores.currency_service import quantize_money
        return quantize_money(value)

    def validate_client_request_id(self, value):
        if value is None:
            return None
        value = str(value).strip()
        return value[:64] or None

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError('يجب إضافة منتج واحد على الأقل.')
        return value

    def create(self, validated_data):
        from core.store_context import ensure_store_context
        request = self.context['request']
        store = ensure_store_context(request)
        if not store:
            raise serializers.ValidationError('يجب اختيار متجر.')
        customer = None
        if validated_data.get('customer_id'):
            customer = Customer.objects.get(pk=validated_data['customer_id'], store=store)
        return create_sale(
            store=store,
            user=request.user,
            items_data=validated_data['items'],
            customer=customer,
            payment_method=validated_data['payment_method'],
            payments=validated_data.get('payments'),
            discount=validated_data['discount'],
            amount_paid=validated_data.get('amount_paid'),
            notes=validated_data.get('notes', ''),
            currency=validated_data.get('currency') or None,
            exchange_rate_override=validated_data.get('exchange_rate'),
            display_exchange_rate=validated_data.get('display_exchange_rate'),
            client_request_id=validated_data.get('client_request_id'),
        )
