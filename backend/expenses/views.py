from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess
from expenses.models import Expense
from expenses.serializers import ExpenseSerializer


class ExpenseViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('expenses', 'expenses_read')]
    search_fields = ['title', 'notes']
    ordering_fields = ['expense_date', 'amount', 'created_at']
    filterset_fields = ['category', 'payment_method']

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('expenses')()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Expense.objects.filter(store=self.get_store()).select_related('created_by')
        if self.request.query_params.get('is_active') != 'false':
            qs = qs.filter(is_active=True)

        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            d = parse_date(date_from)
            if d:
                qs = qs.filter(expense_date__gte=d)
        if date_to:
            d = parse_date(date_to)
            if d:
                qs = qs.filter(expense_date__lte=d)

        return qs

    def create(self, request, *args, **kwargs):
        store = self.get_store()
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = Expense.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                return Response(ExpenseSerializer(existing).data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = serializer.save()
        if getattr(expense, '_idempotent_replay', False):
            return Response(ExpenseSerializer(expense).data, status=status.HTTP_200_OK)

        log_audit(
            request,
            AuditLog.Action.CREATE,
            'Expense',
            expense.id,
            {'title': expense.title, 'amount': str(expense.amount)},
        )
        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        expense = serializer.save()
        log_audit(
            self.request,
            AuditLog.Action.UPDATE,
            'Expense',
            expense.id,
            {'title': expense.title, 'amount': str(expense.amount)},
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        log_audit(
            self.request,
            AuditLog.Action.DELETE,
            'Expense',
            instance.id,
            {'title': instance.title},
        )
