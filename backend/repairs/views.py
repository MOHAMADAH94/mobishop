from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess
from repairs.models import RepairOrder
from repairs.serializers import RecordRepairPaymentSerializer, RepairOrderSerializer


class RepairOrderViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    serializer_class = RepairOrderSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('repairs')]
    pagination_class = None
    search_fields = ['ticket_number', 'customer_name', 'customer_phone', 'imei', 'device_model']
    ordering_fields = ['created_at', 'status', 'estimated_delivery']
    filterset_fields = ['status']

    def get_queryset(self):
        return RepairOrder.objects.filter(store=self.get_store()).select_related(
            'customer', 'assigned_to', 'created_by',
        ).prefetch_related('payments')

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['store'] = self.get_store()
        return ctx

    def create(self, request, *args, **kwargs):
        store = self.get_store()
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = RepairOrder.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                data = RepairOrderSerializer(existing, context=self.get_serializer_context()).data
                return Response(data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        code = status.HTTP_200_OK if getattr(order, '_idempotent_replay', False) else status.HTTP_201_CREATED
        return Response(
            RepairOrderSerializer(order, context=self.get_serializer_context()).data,
            status=code,
        )

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        order = self.get_object()
        serializer = RecordRepairPaymentSerializer(
            data=request.data,
            context={'request': request, 'order': order},
        )
        serializer.is_valid(raise_exception=True)
        order = serializer.save()
        log_audit(
            request, AuditLog.Action.UPDATE, 'RepairOrder', order.id,
            {'payment': str(request.data.get('amount'))},
        )
        return Response(RepairOrderSerializer(order, context=self.get_serializer_context()).data)
