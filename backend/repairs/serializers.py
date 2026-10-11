from django.db import IntegrityError, transaction
from django.utils import timezone
from django.db.models import Max
from rest_framework import serializers

from repairs.models import RepairOrder, RepairPayment
from repairs.services import (
    apply_repair_customer_debt,
    record_repair_payment,
    repair_outstanding,
    reverse_repair_customer_debt,
)


class RepairPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = RepairPayment
        fields = ('id', 'amount', 'method', 'notes', 'created_at')


class RepairOrderSerializer(serializers.ModelSerializer):
    customer_display = serializers.SerializerMethodField()
    assigned_to_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    amount_due = serializers.SerializerMethodField()
    payments = RepairPaymentSerializer(many=True, read_only=True)
    delivery_payment_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True, write_only=True,
    )
    delivery_payment_method = serializers.ChoiceField(
        choices=RepairPayment.Method.choices, required=False, default='cash', write_only=True,
    )

    class Meta:
        model = RepairOrder
        fields = (
            'id', 'ticket_number', 'customer', 'customer_name', 'customer_phone',
            'customer_display', 'device_brand', 'device_model', 'imei',
            'issue_description', 'diagnosis', 'status', 'status_display',
            'currency', 'exchange_rate', 'exchange_rate_to_base',
            'labor_cost', 'parts_cost', 'total_cost', 'deposit_paid', 'amount_due',
            'debt_posted', 'payments',
            'delivery_payment_amount', 'delivery_payment_method',
            'assigned_to', 'assigned_to_name', 'received_at', 'estimated_delivery',
            'completed_at', 'notes', 'client_request_id', 'created_at', 'updated_at',
        )
        read_only_fields = (
            'id', 'ticket_number', 'total_cost', 'received_at',
            'created_at', 'updated_at', 'exchange_rate_to_base', 'debt_posted',
        )

    currency = serializers.CharField(required=False, allow_blank=True)
    exchange_rate = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, allow_null=True, write_only=True,
    )
    client_request_id = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=64)

    def validate_client_request_id(self, value):
        from core.idempotency import normalize_client_request_id
        return normalize_client_request_id(value)

    def get_customer_display(self, obj):
        if obj.customer:
            return obj.customer.name
        return obj.customer_name or '—'

    def get_assigned_to_name(self, obj):
        if obj.assigned_to:
            return obj.assigned_to.get_full_name() or obj.assigned_to.username
        return '—'

    def get_amount_due(self, obj):
        return str(repair_outstanding(obj))

    def create(self, validated_data):
        from stores.currency_service import get_base_currency, snapshot_rate, validate_transaction_currency

        validated_data.pop('delivery_payment_amount', None)
        validated_data.pop('delivery_payment_method', None)

        store = self.context['store']
        client_request_id = validated_data.get('client_request_id')
        if client_request_id:
            existing = RepairOrder.objects.filter(store=store, client_request_id=client_request_id).first()
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

        request = self.context['request']
        last = RepairOrder.objects.filter(store=store).aggregate(m=Max('id'))['m'] or 0
        validated_data['ticket_number'] = f'REP-{last + 1:05d}'
        validated_data['store'] = store
        validated_data['created_by'] = request.user
        customer = validated_data.get('customer')
        if customer:
            validated_data.setdefault('customer_name', customer.name)
            validated_data.setdefault('customer_phone', customer.phone)
        try:
            with transaction.atomic():
                return super().create(validated_data)
        except IntegrityError:
            if client_request_id:
                existing = RepairOrder.objects.filter(store=store, client_request_id=client_request_id).first()
                if existing:
                    existing._idempotent_replay = True
                    return existing
            raise

    def update(self, instance, validated_data):
        from stores.currency_service import get_base_currency, snapshot_rate, validate_transaction_currency

        delivery_payment_amount = validated_data.pop('delivery_payment_amount', None)
        delivery_payment_method = validated_data.pop('delivery_payment_method', 'cash') or 'cash'

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

        new_status = validated_data.get('status', instance.status)
        becoming_delivered = (
            new_status == RepairOrder.Status.DELIVERED
            and instance.status != RepairOrder.Status.DELIVERED
        )
        leaving_delivered = (
            instance.status == RepairOrder.Status.DELIVERED
            and new_status != RepairOrder.Status.DELIVERED
        )

        with transaction.atomic():
            if becoming_delivered:
                validated_data['completed_at'] = timezone.now()

            order = super().update(instance, validated_data)

            if becoming_delivered and delivery_payment_amount is not None:
                from decimal import Decimal
                amt = Decimal(str(delivery_payment_amount))
                if amt > 0:
                    order = record_repair_payment(
                        order, amt, self.context['request'].user,
                        method=delivery_payment_method,
                        notes='تحصيل عند التسليم',
                    )

            if becoming_delivered:
                order = apply_repair_customer_debt(order)
            elif leaving_delivered:
                order = reverse_repair_customer_debt(order)

        return order


class RecordRepairPaymentSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    method = serializers.ChoiceField(choices=RepairPayment.Method.choices, default='cash')
    notes = serializers.CharField(required=False, allow_blank=True, default='')

    def save(self, **kwargs):
        order = self.context['order']
        request = self.context['request']
        return record_repair_payment(
            order,
            self.validated_data['amount'],
            request.user,
            method=self.validated_data.get('method', 'cash'),
            notes=self.validated_data.get('notes', ''),
        )
