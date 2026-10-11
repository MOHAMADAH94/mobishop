from django.urls import path

from core.views import DashboardStatsView, ProductStatsView

urlpatterns = [
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('product-stats/', ProductStatsView.as_view(), name='dashboard-product-stats'),
]
