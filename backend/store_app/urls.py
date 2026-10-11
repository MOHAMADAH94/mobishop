from django.urls import path

from store_app import views

urlpatterns = [
    path('status/', views.StoreAppStatusView.as_view(), name='store-app-status'),
    path('builds/', views.StoreAppBuildListCreateView.as_view(), name='store-app-builds'),
    path('builds/<int:pk>/', views.StoreAppBuildDetailView.as_view(), name='store-app-build-detail'),
    path(
        'builds/<int:pk>/download/',
        views.StoreAppBuildDownloadView.as_view(),
        name='store-app-build-download',
    ),
    path(
        'builds/<int:pk>/retry/',
        views.StoreAppBuildRetryView.as_view(),
        name='store-app-build-retry',
    ),
]
