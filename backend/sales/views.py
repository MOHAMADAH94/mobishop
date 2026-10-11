from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess, IsCashierOrAbove
from sales.models import Sale
from sales.pdf import pdf_http_response
from sales.serializers import (
    PartialReturnSerializer,
    RecordPaymentSerializer,
    SaleCreateSerializer,
    SaleDetailSerializer,
    SaleListSerializer,
    SaleReturnSerializer,
)
from sales.services import cancel_sale


class SaleViewSet(StoreOwnerMixin, viewsets.ReadOnlyModelViewSet):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('sales', 'pos')]
    search_fields = ['invoice_number', 'customer__name', 'customer__phone', 'notes']
    ordering_fields = ['created_at', 'total']
    filterset_fields = ['status', 'payment_method', 'customer']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return SaleDetailSerializer
        return SaleListSerializer

    def get_queryset(self):
        return (
            Sale.objects.filter(store=self.get_store())
            .select_related('customer', 'created_by')
            .prefetch_related('items', 'returns__items', 'payments')
        )

    def get_permissions(self):
        if self.action == 'cancel':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('sales_cancel')()]
        if self.action == 'partial_return':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('sales_return')()]
        if self.action == 'record_payment':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('sales', 'pos')()]
        return super().get_permissions()

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        sale = self.get_object()
        try:
            return pdf_http_response(sale)
        except Exception as exc:
            return Response(
                {'detail': f'تعذر إنشاء ملف PDF للفاتورة: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        sale = self.get_object()
        cancel_sale(sale, request.user, request)
        return Response(SaleDetailSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        sale = self.get_object()
        serializer = RecordPaymentSerializer(
            data=request.data,
            context={'request': request, 'sale': sale},
        )
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        log_audit(request, AuditLog.Action.UPDATE, 'Sale', sale.id, {'payment': str(request.data.get('amount'))})
        return Response(SaleDetailSerializer(sale).data)

    @action(detail=True, methods=['post'], url_path='partial-return')
    def partial_return(self, request, pk=None):
        sale = self.get_object()
        serializer = PartialReturnSerializer(
            data=request.data,
            context={'request': request, 'sale': sale},
        )
        serializer.is_valid(raise_exception=True)
        sale_return = serializer.save()
        log_audit(request, AuditLog.Action.UPDATE, 'Sale', sale.id, {
            'return': sale_return.return_number,
        })
        sale.refresh_from_db()
        return Response({
            'sale': SaleDetailSerializer(sale).data,
            'return': SaleReturnSerializer(sale_return).data,
        })


class SaleCreateView(StoreOwnerMixin, generics.CreateAPIView):
    serializer_class = SaleCreateSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('pos')]

    def create(self, request, *args, **kwargs):
        from core.store_context import ensure_store_context

        store = ensure_store_context(request)
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = Sale.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                return Response(SaleDetailSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sale = serializer.save()
        if getattr(sale, '_idempotent_replay', False):
            return Response(SaleDetailSerializer(sale).data, status=status.HTTP_200_OK)

        log_audit(request, AuditLog.Action.SALE, 'Sale', sale.id, {'invoice': sale.invoice_number})
        return Response(SaleDetailSerializer(sale).data, status=status.HTTP_201_CREATED)
