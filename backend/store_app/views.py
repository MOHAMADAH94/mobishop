from django.http import FileResponse, Http404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from catalog.features import get_catalog_profile
from core.mixins import StoreQuerysetMixin
from core.permissions import HasStoreAccess, IsStoreOwner
from store_app.builder import enqueue_build
from store_app.features import is_store_app_feature_enabled
from store_app.models import StoreAppBuild
from store_app.serializers import (
    StoreAppBuildSerializer,
    StoreAppCreateSerializer,
    StoreAppStatusSerializer,
)
from store_app.services import can_generate_for_store, resolve_store_url


class StoreAppStatusView(StoreQuerysetMixin, APIView):
    permission_classes = [HasStoreAccess, IsStoreOwner]

    def get(self, request):
        store = self.get_store()
        ok, message = can_generate_for_store(store)
        profile = get_catalog_profile(store)
        latest = (
            StoreAppBuild.objects.filter(store=store)
            .order_by('-created_at')
            .first()
        )
        payload = {
            'feature_enabled': is_store_app_feature_enabled(store),
            'can_generate': ok,
            'message': '' if ok else message,
            'store_name': store.name,
            'store_url': resolve_store_url(store),
            'default_app_name': store.name[:50],
            'default_color': '#0F766E',
            'catalog_slug': profile.slug if profile else None,
            'latest_build': latest,
        }
        return Response(
            StoreAppStatusSerializer(payload, context={'request': request}).data,
        )


class StoreAppBuildListCreateView(StoreQuerysetMixin, generics.ListCreateAPIView):
    permission_classes = [HasStoreAccess, IsStoreOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return StoreAppBuild.objects.filter(store=self.get_store()).order_by('-created_at')

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return StoreAppCreateSerializer
        return StoreAppBuildSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['store'] = self.get_store()
        return ctx

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        build = serializer.save()
        enqueue_build(build.pk)
        out = StoreAppBuildSerializer(build, context={'request': request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class StoreAppBuildDetailView(StoreQuerysetMixin, generics.RetrieveAPIView):
    permission_classes = [HasStoreAccess, IsStoreOwner]
    serializer_class = StoreAppBuildSerializer

    def get_queryset(self):
        return StoreAppBuild.objects.filter(store=self.get_store())


class StoreAppBuildDownloadView(StoreQuerysetMixin, APIView):
    permission_classes = [HasStoreAccess, IsStoreOwner]

    def get(self, request, pk):
        store = self.get_store()
        build = StoreAppBuild.objects.filter(pk=pk, store=store).first()
        if not build or build.status != StoreAppBuild.Status.COMPLETED or not build.apk_file:
            raise Http404
        try:
            fh = build.apk_file.open('rb')
        except FileNotFoundError as exc:
            raise Http404 from exc
        filename = f'{build.app_name}-v{build.version_name}.apk'.replace(' ', '_')
        return FileResponse(
            fh,
            as_attachment=True,
            filename=filename,
            content_type='application/vnd.android.package-archive',
        )


class StoreAppBuildRetryView(StoreQuerysetMixin, APIView):
    permission_classes = [HasStoreAccess, IsStoreOwner]

    def post(self, request, pk):
        store = self.get_store()
        build = StoreAppBuild.objects.filter(pk=pk, store=store).first()
        if not build:
            raise Http404
        if build.status not in (StoreAppBuild.Status.FAILED, StoreAppBuild.Status.CANCELLED):
            return Response(
                {'detail': 'يمكن إعادة المحاولة فقط للبناء الفاشل أو الملغى.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ok, message = can_generate_for_store(store)
        if not ok:
            return Response({'detail': message}, status=status.HTTP_403_FORBIDDEN)

        create = StoreAppCreateSerializer(
            data={
                'app_name': build.app_name,
                'primary_color': build.primary_color,
            },
            context={'store': store, 'request': request},
        )
        create.is_valid(raise_exception=True)
        new_build = create.save()
        if build.app_icon and not new_build.app_icon:
            try:
                new_build.app_icon.save(build.app_icon.name.split('/')[-1], build.app_icon, save=True)
            except Exception:  # noqa: BLE001
                pass
        enqueue_build(new_build.pk)
        return Response(
            StoreAppBuildSerializer(new_build, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )
