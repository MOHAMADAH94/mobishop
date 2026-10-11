from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess
from purchases.models import Purchase, Supplier
from purchases.serializers import (
    PurchaseCreateSerializer,
    PurchaseDetailSerializer,
    PurchaseListSerializer,
    RecordPurchasePaymentSerializer,
    SupplierDetailSerializer,
    SupplierListSerializer,
    SupplierWriteSerializer,
)
from purchases.services import cancel_purchase


class SupplierViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('suppliers', 'suppliers_read')]
    pagination_class = None
    search_fields = ['name', 'phone', 'email']
    ordering_fields = ['name', 'balance', 'created_at']
    filterset_fields = ['is_active']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SupplierDetailSerializer
        if self.action in ('create', 'update', 'partial_update'):
            return SupplierWriteSerializer
        return SupplierListSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('suppliers')()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Supplier.objects.filter(store=self.get_store())
        if self.request.query_params.get('is_active') != 'false':
            qs = qs.filter(is_active=True)
        return qs

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()


class PurchaseViewSet(StoreOwnerMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('purchases', 'purchases_read')]
    search_fields = ['invoice_number', 'supplier__name', 'supplier__phone', 'notes']
    ordering_fields = ['created_at', 'total']
    filterset_fields = ['status', 'payment_method', 'supplier']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PurchaseDetailSerializer
        return PurchaseListSerializer

    def get_queryset(self):
        return (
            Purchase.objects.filter(store=self.get_store())
            .select_related('supplier', 'created_by')
            .prefetch_related('items', 'payments')
        )

    def get_permissions(self):
        if self.action == 'cancel':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('purchases_cancel')()]
        if self.action == 'record_payment':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('purchases', 'purchases_read')()]
        return super().get_permissions()

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        purchase = self.get_object()
        cancel_purchase(purchase, request.user, request)
        return Response(PurchaseDetailSerializer(purchase).data)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        purchase = self.get_object()
        serializer = RecordPurchasePaymentSerializer(
            data=request.data,
            context={'request': request, 'purchase': purchase},
        )
        serializer.is_valid(raise_exception=True)
        purchase = serializer.save()
        log_audit(request, AuditLog.Action.UPDATE, 'Purchase', purchase.id, {
            'payment': str(request.data.get('amount')),
        })
        return Response(PurchaseDetailSerializer(purchase).data)


class PurchaseCreateView(StoreOwnerMixin, generics.CreateAPIView):
    serializer_class = PurchaseCreateSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('purchases')]

    def create(self, request, *args, **kwargs):
        from core.store_context import ensure_store_context
        from purchases.models import Purchase

        store = ensure_store_context(request)
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = Purchase.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                return Response(PurchaseDetailSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        purchase = serializer.save()
        if getattr(purchase, '_idempotent_replay', False):
            return Response(PurchaseDetailSerializer(purchase).data, status=status.HTTP_200_OK)

        log_audit(request, AuditLog.Action.CREATE, 'Purchase', purchase.id, {
            'invoice': purchase.invoice_number,
        })
        return Response(PurchaseDetailSerializer(purchase).data, status=status.HTTP_201_CREATED)
