from decimal import Decimal

from django.db.models import F, Q
from django.utils import timezone
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.audit import log_audit
from core.mixins import StoreOwnerMixin
from core.models import AuditLog
from core.permissions import HasPermission, HasStoreAccess
from products.models import Category, InventoryLog, Product
from products.serializers import (
    CategorySerializer,
    InventoryAdjustSerializer,
    InventoryLogSerializer,
    ProductBulkActionSerializer,
    ProductDetailSerializer,
    ProductListSerializer,
    ProductWriteSerializer,
)
from products.services import adjust_inventory, apply_product_bulk_action


class CategoryViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('categories')]
    pagination_class = None
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        from django.db.models import Count, Q

        return (
            Category.objects.filter(store=self.get_store())
            .annotate(products_count=Count('products', filter=Q(products__is_active=True)))
        )

    def perform_create(self, serializer):
        category = serializer.save(store=self.get_store())
        log_audit(self.request, AuditLog.Action.CREATE, 'Category', category.id, {'name': category.name})

    def perform_update(self, serializer):
        category = serializer.save()
        log_audit(self.request, AuditLog.Action.UPDATE, 'Category', category.id, {'name': category.name})

    def perform_destroy(self, instance):
        log_audit(self.request, AuditLog.Action.DELETE, 'Category', instance.id, {'name': instance.name})
        instance.delete()


class ProductViewSet(StoreOwnerMixin, viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('products', 'products_read')]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    search_fields = ['name', 'sku', 'barcode', 'imei']
    ordering_fields = ['name', 'sell_price', 'quantity', 'created_at']
    filterset_fields = ['category']

    def get_serializer_class(self):
        if self.action in ('create', 'update', 'partial_update'):
            return ProductWriteSerializer
        if self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductListSerializer

    def get_permissions(self):
        if self.action in (
            'create', 'update', 'partial_update', 'destroy',
            'adjust_stock', 'bulk', 'generate_barcode',
        ):
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('products')()]
        if self.action == 'offline_cache':
            return [IsAuthenticated(), HasStoreAccess(), HasPermission('pos', 'products', 'products_read')()]
        return super().get_permissions()

    def get_queryset(self):
        qs = Product.objects.filter(store=self.get_store()).select_related('category')
        active_param = (self.request.query_params.get('is_active') or '').strip().lower()
        if active_param in ('all', 'any'):
            pass
        elif active_param == 'false':
            qs = qs.filter(is_active=False)
        else:
            qs = qs.filter(is_active=True)

        availability = (self.request.query_params.get('availability') or '').strip().lower()
        if availability == 'in_stock':
            qs = qs.filter(quantity__gt=0)
        elif availability == 'out_of_stock':
            qs = qs.filter(quantity=0)
        elif availability == 'low_stock' or self.request.query_params.get('low_stock') == 'true':
            qs = qs.filter(quantity__gt=0, quantity__lte=F('low_stock_threshold'))

        catalog = (self.request.query_params.get('catalog') or '').strip().lower()
        if catalog == 'published':
            qs = qs.filter(publish_in_catalog=True)
        elif catalog == 'unpublished':
            qs = qs.filter(publish_in_catalog=False)
        elif catalog == 'offers':
            qs = qs.filter(is_catalog_offer=True, publish_in_catalog=True)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['store'] = self.get_store()
        return ctx

    def perform_create(self, serializer):
        store = self.get_store()
        product = serializer.save()
        if not product.store_id:
            product.store = store
            product.save(update_fields=['store'])
        # ضمان جذري: أي إنشاء عبر الـ API ينتهي بمنتج نشط
        if not product.is_active:
            Product.objects.filter(pk=product.pk).update(is_active=True)
            product.is_active = True
        log_audit(self.request, AuditLog.Action.CREATE, 'Product', product.id)

    def create(self, request, *args, **kwargs):
        store = self.get_store()
        client_id = (request.data.get('client_request_id') or '').strip()
        if store and client_id:
            existing = Product.objects.filter(store=store, client_request_id=client_id).first()
            if existing:
                output = ProductDetailSerializer(existing, context=self.get_serializer_context())
                return Response(output.data, status=status.HTTP_200_OK)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = serializer.instance
        if getattr(instance, '_idempotent_replay', False):
            output = ProductDetailSerializer(instance, context=self.get_serializer_context())
            return Response(output.data, status=status.HTTP_200_OK)
        output = ProductDetailSerializer(instance, context=self.get_serializer_context())
        headers = self.get_success_headers(output.data)
        return Response(output.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        product = Product.objects.select_related('category').get(pk=serializer.instance.pk)
        log_audit(self.request, AuditLog.Action.UPDATE, 'Product', product.id)
        return Response(
            ProductDetailSerializer(product, context=self.get_serializer_context()).data,
        )

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()
        log_audit(self.request, AuditLog.Action.DELETE, 'Product', instance.id)

    @action(detail=False, methods=['get'], url_path='offline-cache')
    def offline_cache(self, request):
        """Compact product list for POS offline cache (no pagination)."""
        qs = (
            Product.objects.filter(store=self.get_store(), is_active=True)
            .select_related('category')
            .order_by('name')[:2000]
        )
        data = [
            {
                'id': p.id,
                'name': p.name,
                'sku': p.sku or '',
                'barcode': p.barcode or '',
                'imei': p.imei or '',
                'sell_price': str(p.sell_price),
                'buy_price': str(p.buy_price),
                'quantity': p.quantity,
                'low_stock_threshold': p.low_stock_threshold,
                'category': p.category_id,
                'category_name': p.category.name if p.category_id else '',
                'is_active': p.is_active,
                'is_low_stock': p.is_low_stock,
                'allow_fractional_quantity': p.allow_fractional_quantity,
                'quantity_precision': p.quantity_precision,
                'unit': p.unit or '',
                'image_url': request.build_absolute_uri(p.image.url) if p.image else None,
            }
            for p in qs
        ]
        return Response({'products': data, 'cached_at': timezone.now().isoformat()})

    @action(detail=True, methods=['post'], url_path='generate-barcode')
    def generate_barcode(self, request, pk=None):
        from products.barcode_service import generate_unique_barcode

        product = self.get_object()
        force = str(request.data.get('force', '')).lower() in ('1', 'true', 'yes')
        if product.barcode and not force:
            return Response(
                {'barcode': product.barcode, 'generated': False, 'detail': 'المنتج لديه باركود مسبقاً.'},
            )
        try:
            code = generate_unique_barcode(self.get_store(), product)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_audit(request, AuditLog.Action.UPDATE, 'Product', product.id, {'barcode': code})
        return Response({'barcode': code, 'generated': True, 'id': product.id})

    @action(detail=False, methods=['post'], url_path='generate-barcode')
    def generate_barcode_preview(self, request):
        """Generate a unique barcode value without assigning (for new product forms)."""
        from products.barcode_service import generate_unique_barcode

        try:
            code = generate_unique_barcode(self.get_store(), product=None)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'barcode': code, 'generated': True})

    @action(detail=False, methods=['get'], url_path='inventory-summary')
    def inventory_summary(self, request):
        from django.db.models import Count, Sum
        from django.db.models.functions import Coalesce
        from django.db.models import DecimalField
        agg = Product.objects.filter(store=self.get_store(), is_active=True).aggregate(
            inventory_cost_value=Coalesce(
                Sum(F('buy_price') * F('quantity'), output_field=DecimalField()),
                Decimal('0'),
            ),
            inventory_sell_value=Coalesce(
                Sum(F('sell_price') * F('quantity'), output_field=DecimalField()),
                Decimal('0'),
            ),
            total_products=Count('id'),
        )
        return Response({
            'inventory_cost_value': str(agg['inventory_cost_value']),
            'inventory_sell_value': str(agg['inventory_sell_value']),
            'total_products': agg['total_products'],
        })

    @action(detail=True, methods=['post'])
    def adjust_stock(self, request, pk=None):
        product = self.get_object()
        ser = InventoryAdjustSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        client_id = ser.validated_data.get('client_request_id')
        if client_id:
            from products.models import InventoryLog
            existing = InventoryLog.objects.filter(
                store=product.store, client_request_id=client_id,
            ).select_related('product').first()
            if existing:
                return Response(
                    ProductDetailSerializer(existing.product, context=self.get_serializer_context()).data,
                    status=status.HTTP_200_OK,
                )
        result = adjust_inventory(
            product,
            ser.validated_data['quantity_change'],
            ser.validated_data['action'],
            user=request.user,
            notes=ser.validated_data.get('notes', ''),
            client_request_id=client_id,
        )
        result.refresh_from_db()
        return Response(ProductDetailSerializer(result, context=self.get_serializer_context()).data)

    @action(detail=False, methods=['post'], url_path='bulk')
    def bulk(self, request):
        ser = ProductBulkActionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        store = self.get_store()
        action_name = ser.validated_data['action']
        category = None
        if action_name == 'set_category':
            category = Category.objects.filter(
                store=store, pk=ser.validated_data['category_id'],
            ).first()
            if not category:
                return Response({'detail': 'التصنيف غير موجود.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            updated, matched_ids = apply_product_bulk_action(
                store,
                ser.validated_data['ids'],
                action_name,
                category=category,
            )
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        log_audit(
            request,
            AuditLog.Action.UPDATE,
            'Product',
            store.id,
            {'bulk_action': action_name, 'updated': updated, 'ids': matched_ids[:50]},
        )
        return Response({'updated': updated, 'ids': matched_ids})


class InventoryLogListView(StoreOwnerMixin, generics.ListAPIView):
    serializer_class = InventoryLogSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('inventory')]

    def get_queryset(self):
        from django.utils.dateparse import parse_date

        qs = InventoryLog.objects.filter(store=self.get_store()).select_related('product', 'created_by')
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        date_from = self.request.query_params.get('date_from')
        date_to = self.request.query_params.get('date_to')
        if date_from:
            d = parse_date(date_from)
            if d:
                qs = qs.filter(created_at__date__gte=d)
        if date_to:
            d = parse_date(date_to)
            if d:
                qs = qs.filter(created_at__date__lte=d)
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        return qs


class ProductSearchView(StoreOwnerMixin, generics.ListAPIView):
    serializer_class = ProductListSerializer
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('products', 'products_read', 'pos')]
    pagination_class = None

    def get_queryset(self):
        q = self.request.query_params.get('q', '').strip()
        qs = Product.objects.filter(store=self.get_store(), is_active=True)
        if q:
            qs = qs.filter(
                Q(name__icontains=q) | Q(sku__icontains=q) |
                Q(barcode__icontains=q) | Q(imei__icontains=q)
            )
        return qs[:20]


class ProductLookupView(StoreOwnerMixin, APIView):
    """Exact match by barcode, SKU, or IMEI — for scanners and camera."""
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('products', 'products_read', 'pos')]

    def get(self, request):
        code = request.query_params.get('code', '').strip()
        if not code:
            return Response({'detail': 'أدخل رمز البحث.'}, status=status.HTTP_400_BAD_REQUEST)

        qs = Product.objects.filter(store=self.get_store(), is_active=True).select_related('category')
        match = Q(barcode__iexact=code) | Q(sku__iexact=code) | Q(imei__iexact=code)
        digits = ''.join(c for c in code if c.isdigit())
        if digits and digits != code:
            match |= Q(imei__iexact=digits)
        product = qs.filter(match).first()
        if not product:
            return Response(
                {'detail': 'لم يُعثر على منتج بهذا الباركود أو SKU أو IMEI.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            ProductListSerializer(product, context=self.get_serializer_context()).data,
        )

    def get_serializer_context(self):
        return {'request': self.request, 'store': self.get_store()}
