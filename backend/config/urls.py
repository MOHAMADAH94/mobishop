from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = 'موبي شوب'
admin.site.site_title = 'موبي شوب — الإدارة'
admin.site.index_title = 'لوحة التقارير والإحصائيات'


def health_check(_request):
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check),
    path('api/auth/', include('users.urls')),
    path('api/stores/', include('stores.urls')),
    path('api/products/', include('products.urls')),
    path('api/sales/', include('sales.urls')),
    path('api/customers/', include('customers.urls')),
    path('api/repairs/', include('repairs.urls')),
    path('api/expenses/', include('expenses.urls')),
    path('api/purchases/', include('purchases.urls')),
    path('api/dashboard/', include('core.urls')),
    path('api/intelligence/', include('intelligence.urls')),
    path('api/assistant/', include('assistant.urls')),
    path('api/', include('catalog.urls')),
    path('api/', include('marketplace.urls')),
    path('api/store-app/', include('store_app.urls')),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
