from rest_framework import serializers

from customers.debt import get_customer_debt_references
from customers.models import Customer
from sales.serializers import SaleListSerializer


class CustomerListSerializer(serializers.ModelSerializer):
    sales_count = serializers.SerializerMethodField()
    debt_references = serializers.SerializerMethodField()

    class Meta:
        model = Customer
        fields = (
            'id', 'name', 'phone', 'email', 'address', 'notes', 'debt',
            'is_active', 'sales_count', 'debt_references', 'created_at',
        )

    def get_sales_count(self, obj):
        return obj.sales.exclude(status='cancelled').count()

    def get_debt_references(self, obj):
        return get_customer_debt_references(obj)


class CustomerDetailSerializer(CustomerListSerializer):
    recent_sales = serializers.SerializerMethodField()

    class Meta(CustomerListSerializer.Meta):
        fields = CustomerListSerializer.Meta.fields + ('address', 'notes', 'recent_sales', 'updated_at')

    def get_recent_sales(self, obj):
        sales = obj.sales.order_by('-created_at')[:10]
        return SaleListSerializer(sales, many=True).data


class CustomerWriteSerializer(serializers.ModelSerializer):
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)

    class Meta:
        model = Customer
        fields = ('name', 'phone', 'email', 'address', 'notes', 'is_active', 'client_request_id')

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)
