from django.urls import path
from rest_framework.routers import DefaultRouter

from sales.views import SaleCreateView, SaleViewSet

router = DefaultRouter()
router.register('', SaleViewSet, basename='sales')

urlpatterns = [
    path('create/', SaleCreateView.as_view(), name='sale-create'),
] + router.urls
