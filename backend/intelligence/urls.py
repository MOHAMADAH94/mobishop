from django.urls import path

from intelligence.views import (
    DecisionCenterSummaryView,
    DecisionCenterView,
    ProfitBreakdownView,
    ProfitCategoriesView,
    ProfitDashboardView,
    ProfitEmployeesView,
    ProfitExportExcelView,
    ProfitExportPdfView,
    ProfitProductsView,
    ProfitSuppliersView,
    ProfitTrendsView,
    RecommendationDismissView,
    RecommendationListView,
    RecommendationRefreshView,
)

urlpatterns = [
    path('decision-center/summary/', DecisionCenterSummaryView.as_view(), name='decision-center-summary'),
    path('decision-center/recommendations/', RecommendationListView.as_view(), name='decision-center-list'),
    path('decision-center/recommendations/<int:pk>/dismiss/', RecommendationDismissView.as_view(), name='decision-center-dismiss'),
    path('decision-center/refresh/', RecommendationRefreshView.as_view(), name='decision-center-refresh'),
    path('decision-center/', DecisionCenterView.as_view(), name='decision-center'),
    path('profit/dashboard/', ProfitDashboardView.as_view(), name='profit-dashboard'),
    path('profit/breakdown/', ProfitBreakdownView.as_view(), name='profit-breakdown'),
    path('profit/products/', ProfitProductsView.as_view(), name='profit-products'),
    path('profit/categories/', ProfitCategoriesView.as_view(), name='profit-categories'),
    path('profit/employees/', ProfitEmployeesView.as_view(), name='profit-employees'),
    path('profit/suppliers/', ProfitSuppliersView.as_view(), name='profit-suppliers'),
    path('profit/trends/', ProfitTrendsView.as_view(), name='profit-trends'),
    path('profit/export/excel/', ProfitExportExcelView.as_view(), name='profit-export-excel'),
    path('profit/export/pdf/', ProfitExportPdfView.as_view(), name='profit-export-pdf'),
]
