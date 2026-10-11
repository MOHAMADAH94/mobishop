from django.urls import path
from rest_framework.routers import DefaultRouter

from stores.views import (
    EmployeeInviteView,
    MyStoresView,
    RolesListView,
    StoreCashboxView,
    StoreCreateView,
    StoreCurrenciesView,
    StoreDetailView,
    StoreExportExcelView,
    StoreMembershipViewSet,
    StoreRolePermissionsView,
    StoreSettingsView,
)

router = DefaultRouter()
router.register('members', StoreMembershipViewSet, basename='store-members')

urlpatterns = [
    path('', MyStoresView.as_view(), name='stores-list'),
    path('create/', StoreCreateView.as_view(), name='stores-create'),
    path('current/', StoreDetailView.as_view(), name='stores-current'),
    path('settings/', StoreSettingsView.as_view(), name='stores-settings'),
    path('currencies/', StoreCurrenciesView.as_view(), name='stores-currencies'),
    path('cashbox/', StoreCashboxView.as_view(), name='stores-cashbox'),
    path('export/excel/', StoreExportExcelView.as_view(), name='stores-export-excel'),
    path('roles/', RolesListView.as_view(), name='stores-roles'),
    path('role-permissions/', StoreRolePermissionsView.as_view(), name='stores-role-permissions'),
    path('invite/', EmployeeInviteView.as_view(), name='stores-invite'),
] + router.urls
