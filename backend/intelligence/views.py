import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.permissions import HasPermission, HasStoreAccess
from core.store_context import ensure_store_context
from intelligence.decision_engine import (
    get_decision_center_summary,
    refresh_store_recommendations,
)
from intelligence.export import profit_excel_response, profit_pdf_response
from intelligence.models import BusinessRecommendation
from intelligence.profit_service import (
    compute_category_profitability,
    compute_dashboard_metrics,
    compute_employee_profitability,
    compute_product_profitability,
    compute_profit_breakdown,
    compute_profit_trends,
    compute_supplier_profitability,
)
from intelligence.serializers import BusinessRecommendationSerializer, DecisionCenterSummarySerializer

logger = logging.getLogger(__name__)


class DecisionCenterSummaryView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('decision_center')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(DecisionCenterSummarySerializer(instance=get_decision_center_summary(store)).data)


class DecisionCenterView(APIView):
    """ملخص + توصيات في طلب واحد — أسرع لصفحة مركز القرارات."""
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('decision_center')]

    def get(self, request):
        store = ensure_store_context(request)
        qs = BusinessRecommendation.objects.filter(
            store=store, is_active=True, is_dismissed=False,
        ).order_by('-generated_at')[:100]
        return Response({
            'summary': get_decision_center_summary(store),
            'recommendations': BusinessRecommendationSerializer(qs, many=True).data,
        })


class RecommendationListView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('decision_center')]

    def get(self, request):
        store = ensure_store_context(request)
        qs = BusinessRecommendation.objects.filter(
            store=store, is_active=True, is_dismissed=False,
        ).order_by('-generated_at')

        severity = request.query_params.get('severity')
        kind = request.query_params.get('kind')
        category = request.query_params.get('category')

        if severity:
            qs = qs.filter(severity=severity)
        if kind:
            qs = qs.filter(kind=kind)
        if category:
            qs = qs.filter(category=category)

        serializer = BusinessRecommendationSerializer(qs[:100], many=True)
        return Response(serializer.data)


class RecommendationDismissView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('decision_center')]

    def post(self, request, pk):
        store = ensure_store_context(request)
        try:
            rec = BusinessRecommendation.objects.get(pk=pk, store=store)
        except BusinessRecommendation.DoesNotExist:
            return Response({'detail': 'التوصية غير موجودة.'}, status=status.HTTP_404_NOT_FOUND)
        rec.is_dismissed = True
        rec.is_active = False
        rec.save(update_fields=['is_dismissed', 'is_active', 'updated_at'])
        return Response({'detail': 'تم تجاهل التوصية.'})


class RecommendationRefreshView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('decision_center')]

    def post(self, request):
        store = ensure_store_context(request)
        count = refresh_store_recommendations(store)
        return Response({'detail': f'تم تحديث {count} توصية.', 'count': count})


class ProfitDashboardView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(compute_dashboard_metrics(store))


class ProfitBreakdownView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        period = request.query_params.get('period', 'month')
        return Response(compute_profit_breakdown(store, period))


class ProfitProductsView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(compute_product_profitability(
            store,
            request.query_params.get('date_from'),
            request.query_params.get('date_to'),
            limit=int(request.query_params.get('limit', 50)),
        ))


class ProfitCategoriesView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(compute_category_profitability(
            store,
            request.query_params.get('date_from'),
            request.query_params.get('date_to'),
        ))


class ProfitEmployeesView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(compute_employee_profitability(
            store,
            request.query_params.get('date_from'),
            request.query_params.get('date_to'),
        ))


class ProfitSuppliersView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        return Response(compute_supplier_profitability(
            store,
            request.query_params.get('date_from'),
            request.query_params.get('date_to'),
        ))


class ProfitTrendsView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        days = int(request.query_params.get('days', 30))
        return Response(compute_profit_trends(store, min(days, 90)))


class ProfitExportExcelView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        try:
            return profit_excel_response(
                store,
                request.query_params.get('date_from'),
                request.query_params.get('date_to'),
            )
        except Exception:
            logger.exception('Profit Excel export failed')
            return Response({'detail': 'فشل تصدير التقرير.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class ProfitExportPdfView(APIView):
    permission_classes = [IsAuthenticated, HasStoreAccess, HasPermission('profit_intelligence')]

    def get(self, request):
        store = ensure_store_context(request)
        try:
            return profit_pdf_response(
                store,
                request.query_params.get('date_from'),
                request.query_params.get('date_to'),
            )
        except Exception:
            logger.exception('Profit PDF export failed')
            return Response({'detail': 'فشل تصدير التقرير.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
