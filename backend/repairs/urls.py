from rest_framework.routers import DefaultRouter

from repairs.views import RepairOrderViewSet

router = DefaultRouter()
router.register('', RepairOrderViewSet, basename='repairs')

urlpatterns = router.urls
