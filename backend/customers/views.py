from django.db import IntegrityError, transaction
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess
from customers.models import Customer
from customers.serializers import (
    CustomerDetailSerializer,
    CustomerListSerializer,
    CustomerWriteSerializer,
)


class CustomerViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('customers', 'customers_read')]
    pagination_class = None
    search_fields = ['name', 'phone', 'email']
    ordering_fields = ['name', 'debt', 'created_at']
    filterset_fields = ['is_active']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return CustomerDetailSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return CustomerWriteSerializer
        return CustomerListSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'record_payment'):
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('customers')()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Customer.objects.filter(store=self.get_store())
        if self.request.query_params.get('is_active') != 'false':
            qs = qs.filter(is_active=True)
        return qs

    def create(self, request, *args, **kwargs):
        store = self.get_store()
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = Customer.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                return Response(CustomerListSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                customer = serializer.save(store=store)
        except IntegrityError:
            if client_id:
                existing = Customer.objects.filter(store=store, client_request_id=client_id).first()
                if existing:
                    return Response(CustomerListSerializer(existing).data, status=status.HTTP_200_OK)
            raise
        return Response(CustomerListSerializer(customer).data, status=status.HTTP_201_CREATED)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """تسجيل دفعة مخصّصة لفاتورة أو تذكرة صيانة مرتبطة بالعميل."""
        from repairs.models import RepairOrder
        from repairs.services import record_repair_payment
        from sales.models import Sale
        from sales.services import record_sale_payment

        customer = self.get_object()
        amount = request.data.get('amount')
        method = request.data.get('method', 'cash')
        notes = request.data.get('notes', '')
        sale_id = request.data.get('sale_id')
        repair_id = request.data.get('repair_id')

        if not sale_id and not repair_id:
            return Response(
                {'detail': 'حدد فاتورة (sale_id) أو تذكرة صيانة (repair_id).'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if sale_id and repair_id:
            return Response(
                {'detail': 'اختر مرجعاً واحداً فقط: فاتورة أو صيانة.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if sale_id:
                sale = Sale.objects.get(pk=sale_id, store=customer.store, customer=customer)
                record_sale_payment(sale, amount, request.user, method=method, notes=notes)
            else:
                order = RepairOrder.objects.get(pk=repair_id, store=customer.store, customer=customer)
                record_repair_payment(order, amount, request.user, method=method, notes=notes)
        except (Sale.DoesNotExist, RepairOrder.DoesNotExist):
            return Response({'detail': 'المرجع غير موجود لهذا العميل.'}, status=status.HTTP_404_NOT_FOUND)
        except ValidationError:
            raise

        customer.refresh_from_db()
        log_audit(
            request, AuditLog.Action.UPDATE, 'Customer', customer.id,
            {'payment': str(amount), 'sale_id': sale_id, 'repair_id': repair_id},
        )
        return Response(CustomerDetailSerializer(customer).data)
