from rest_framework import serializers

from expenses.models import Expense


class ExpenseSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source='get_category_display', read_only=True)
    payment_method_label = serializers.CharField(source='get_payment_method_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = (
            'id', 'title', 'amount', 'currency', 'exchange_rate', 'exchange_rate_to_base',
            'category', 'category_label',
            'payment_method', 'payment_method_label', 'expense_date',
            'notes', 'is_active', 'client_request_id', 'created_by_name', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'is_active', 'created_by_name', 'created_at', 'updated_at', 'exchange_rate_to_base')

    currency = serializers.CharField(required=False, allow_blank=True)
    exchange_rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True, write_only=True,
    )
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return '—'

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('المبلغ يجب أن يكون أكبر من صفر.')
        return value

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('الوصف مطلوب.')
        return value

    def create(self, validated_data):
        from core.store_context import ensure_store_context
        from django.db import IntegrityError, transaction
        from stores.currency_service import get_base_currency, snapshot_rate, validate_transaction_currency

        request = self.context['request']
        store = ensure_store_context(request)
        client_request_id = validated_data.get('client_request_id')
        if client_request_id:
            existing = Expense.objects.filter(store=store, client_request_id=client_request_id).first()
            if existing:
                existing._idempotent_replay = True
                return existing

        base = get_base_currency(store)
        currency = validate_transaction_currency(
            store, validated_data.pop('currency', None) or base,
        )
        rate_override = validated_data.pop('exchange_rate', None)
        validated_data['currency'] = currency
        validated_data['exchange_rate_to_base'] = snapshot_rate(store, currency, rate_override)
        validated_data['store'] = store
        validated_data['created_by'] = request.user
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            if client_request_id:
                existing = Expense.objects.filter(store=store, client_request_id=client_request_id).first()
                if existing:
                    existing._idempotent_replay = True
                    return existing
            raise

    def update(self, instance, validated_data):
        from stores.currency_service import get_base_currency, snapshot_rate, validate_transaction_currency

        store = instance.store
        base = get_base_currency(store)
        if 'currency' in validated_data or 'exchange_rate' in validated_data:
            currency = validate_transaction_currency(
                store, validated_data.pop('currency', instance.currency) or base,
            )
            rate_override = validated_data.pop('exchange_rate', None)
            validated_data['currency'] = currency
            validated_data['exchange_rate_to_base'] = snapshot_rate(store, currency, rate_override)
        validated_data.pop('exchange_rate', None)
        return super().update(instance, validated_data)
