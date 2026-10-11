from django.contrib.auth import get_user_model
from rest_framework import generics, status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import log_audit
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess, IsStoreOwner
from core.store_context import ensure_store_context
from stores.models import Employee, Role, Store, StoreMembership, StoreSettings
from core.role_permissions import CONFIGURABLE_ROLES, PERMISSION_LABELS, get_effective_permissions
from stores.serializers import (
    EmployeeInviteSerializer,
    RoleSerializer,
    StoreCreateSerializer,
    StoreDetailSerializer,
    StoreListSerializer,
    StoreMembershipSerializer,
    StoreRolePermissionSerializer,
    StoreSettingsSerializer,
    StoreUpdateSerializer,
)

User = get_user_model()


class MyStoresView(generics.ListAPIView):
    serializer_class = StoreListSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return Store.objects.filter(
            memberships__user=self.request.user,
            memberships__is_active=True,
            is_active=True,
        ).distinct()


class StoreCreateView(generics.CreateAPIView):
    serializer_class = StoreCreateSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        store = serializer.save()
        log_audit(self.request, AuditLog.Action.CREATE, 'Store', store.id, {'name': store.name})


class StoreDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, HasStoreAccess]

    def get_permissions(self):
        if self.request.method in ('PUT', 'PATCH'):
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('settings')()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.request.method in ('PUT', 'PATCH'):
            return StoreUpdateSerializer
        return StoreDetailSerializer

    def get_object(self):
        return ensure_store_context(self.request)


class StoreSettingsView(generics.RetrieveUpdateAPIView):
    serializer_class = StoreSettingsSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('settings')]

    def get_object(self):
        store = ensure_store_context(self.request)
        settings, _ = StoreSettings.objects.get_or_create(store=store)
        return settings


class StoreMembershipViewSet(viewsets.ModelViewSet):
    serializer_class = StoreMembershipSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]
    pagination_class = None

    def get_queryset(self):
        store = ensure_store_context(self.request)
        return StoreMembership.objects.filter(store=store).select_related('user', 'role')

    def perform_destroy(self, instance):
        if instance.user_id == self.request.store.owner_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('لا يمكن إزالة مالك المتجر.')
        instance.is_active = False
        instance.save()


class EmployeeInviteView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]

    def post(self, request):
        store = ensure_store_context(request)
        if not store:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('يجب اختيار متجر أولاً.')

        serializer = EmployeeInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email = data['email']
        base_username = email.split('@')[0].replace('.', '_')[:30]
        username = base_username
        counter = 1
        while User.objects.filter(username=username).exists():
            username = f'{base_username}{counter}'[:150]
            counter += 1

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            user = User.objects.create(
                username=username,
                email=email,
                first_name=data.get('first_name', ''),
                last_name=data.get('last_name', ''),
            )
            user.set_unusable_password()
            user.save()

        role = Role.objects.get(pk=data['role_id'])
        membership, _ = StoreMembership.objects.update_or_create(
            store=store,
            user=user,
            defaults={'role': role, 'is_active': True},
        )
        Employee.objects.get_or_create(
            store=store,
            user=user,
            defaults={'membership': membership},
        )
        return Response(StoreMembershipSerializer(membership).data, status=status.HTTP_201_CREATED)


class RolesListView(generics.ListAPIView):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        store = ensure_store_context(self.request)
        if store:
            ctx['store'] = store
        return ctx


class StoreExportExcelView(APIView):
    """تصدير بيانات المتجر إلى Excel (للمالك فقط)."""

    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]

    def get(self, request):
        store = ensure_store_context(request)
        if not store:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('يجب اختيار متجر أولاً.')
        try:
            from stores.export import excel_http_response
        except ImportError:
            return Response(
                {'detail': 'مكتبة Excel غير مثبتة على الخادم. نفّذ: pip install -r requirements-hosting.txt'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        try:
            log_audit(request, AuditLog.Action.UPDATE, 'Store', store.id, {'export': 'xlsx'})
            return excel_http_response(store)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Store Excel export failed')
            return Response(
                {'detail': 'فشل تصدير البيانات. تأكد من تحديث الباك اند وتشغيل migrate.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class StoreCurrenciesView(APIView):
    """عرض وتحديث العملات وأسعار الصرف."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasStoreAccess()]
        return [IsAuthenticated(), HasStoreAccess(), IsStoreOwner()]

    def get(self, request):
        from stores.currency_service import serialize_currencies

        store = ensure_store_context(request)
        return Response(serialize_currencies(store))

    def put(self, request):
        from stores.serializers import StoreCurrenciesUpdateSerializer, serialize_currencies

        store = ensure_store_context(request)
        serializer = StoreCurrenciesUpdateSerializer(
            data=request.data,
            context={'store': store, 'user': request.user},
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.save()
        log_audit(request, AuditLog.Action.UPDATE, 'StoreCurrency', store.id, {'currencies': 'updated'})
        return Response(data)


class StoreRolePermissionsView(APIView):
    """عرض وتعديل صلاحيات الأدوار للمتجر (للمالك فقط)."""

    permission_classes = [IsAuthenticated, HasStoreAccess, IsStoreOwner]

    def get(self, request):
        store = ensure_store_context(request)
        roles = Role.objects.filter(code__in=CONFIGURABLE_ROLES)
        return Response({
            'available_permissions': [
                {'code': code, 'label': label}
                for code, label in PERMISSION_LABELS.items()
            ],
            'roles': [
                {
                    'role': RoleSerializer(role, context={'store': store}).data,
                    'permissions': get_effective_permissions(store, role),
                }
                for role in roles
            ],
        })

    def put(self, request):
        store = ensure_store_context(request)
        serializer = StoreRolePermissionSerializer(data=request.data, context={'store': store})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        role = Role.objects.get(code=serializer.validated_data['role_code'])
        return Response({
            'role': RoleSerializer(role, context={'store': store}).data,
            'permissions': get_effective_permissions(store, role),
        })


class StoreCashboxView(APIView):
    """رصيد الصندوق النقدي لكل عملة (محسوب + رصيد افتتاحي)."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('dashboard', 'sales', 'settings')()]
        return [IsAuthenticated(), HasStoreAccess(), IsStoreOwner()]

    def get(self, request):
        from stores.cashbox import compute_cashbox

        store = ensure_store_context(request)
        return Response(compute_cashbox(store))

    def post(self, request):
        from stores.cashbox import compute_cashbox, set_opening_cash_balance

        store = ensure_store_context(request)
        code = (request.data.get('code') or '').strip()
        amount = request.data.get('opening')
        if not code:
            return Response({'detail': 'حدد رمز العملة.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount is None:
            return Response({'detail': 'حدد الرصيد الافتتاحي.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            set_opening_cash_balance(store, code, amount)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(
            request, AuditLog.Action.UPDATE, 'StoreCurrency', store.id,
            {'opening_cash': str(amount), 'code': code},
        )
        return Response(compute_cashbox(store))
