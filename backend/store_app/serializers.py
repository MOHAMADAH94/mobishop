from rest_framework import serializers

from store_app.models import StoreAppBuild
from store_app.services import (
    can_generate_for_store,
    next_version,
    package_name_for_store,
    resolve_store_url,
    sanitize_app_name,
    sanitize_color,
    validate_icon_upload,
)


class StoreAppBuildSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    status_label = serializers.SerializerMethodField()
    is_installable = serializers.SerializerMethodField()

    class Meta:
        model = StoreAppBuild
        fields = (
            'id',
            'app_name',
            'app_icon',
            'store_url',
            'primary_color',
            'package_name',
            'version_name',
            'version_code',
            'status',
            'status_label',
            'is_installable',
            'error_message',
            'download_url',
            'created_at',
            'started_at',
            'completed_at',
        )
        read_only_fields = fields

    def get_is_installable(self, obj):
        if isinstance(obj, dict):
            return obj.get('status') == 'completed' and obj.get('technical_error') != 'MOCK_APK_NOT_INSTALLABLE'
        return (
            obj.status == StoreAppBuild.Status.COMPLETED
            and obj.technical_error != 'MOCK_APK_NOT_INSTALLABLE'
        )

    def get_download_url(self, obj):
        if obj.status != StoreAppBuild.Status.COMPLETED or not obj.apk_file:
            return None
        request = self.context.get('request')
        path = f'/api/store-app/builds/{obj.pk}/download/'
        if request:
            return request.build_absolute_uri(path)
        return path

    def get_status_label(self, obj):
        if isinstance(obj, dict):
            status = obj.get('status', '')
            labels = dict(StoreAppBuild.Status.choices)
            return labels.get(status, status)
        return obj.get_status_display()


class StoreAppCreateSerializer(serializers.Serializer):
    app_name = serializers.CharField(required=False, allow_blank=True, max_length=50)
    primary_color = serializers.CharField(required=False, allow_blank=True, max_length=7)
    app_icon = serializers.ImageField(required=False, allow_null=True)

    def validate_app_icon(self, value):
        try:
            validate_icon_upload(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        return value

    def create(self, validated_data):
        store = self.context['store']
        user = self.context['request'].user
        ok, message = can_generate_for_store(store)
        if not ok:
            raise serializers.ValidationError({'detail': message})

        store_url = resolve_store_url(store)
        if not store_url:
            raise serializers.ValidationError({'detail': 'رابط المتجر غير متوفر.'})

        # Reject any client attempt to override store URL (not in fields, but belt+suspenders)
        if 'store_url' in self.initial_data or 'store_id' in self.initial_data:
            raise serializers.ValidationError({'detail': 'لا يمكن تحديد متجر أو رابط خارجي.'})

        try:
            app_name = sanitize_app_name(validated_data.get('app_name') or '', store.name)
            color = sanitize_color(validated_data.get('primary_color'))
        except ValueError as exc:
            raise serializers.ValidationError({'detail': str(exc)}) from exc

        # Block concurrent builds for same store
        active = StoreAppBuild.objects.filter(
            store=store,
            status__in=[StoreAppBuild.Status.PENDING, StoreAppBuild.Status.BUILDING],
        ).exists()
        if active:
            raise serializers.ValidationError(
                {'detail': 'يوجد إنشاء تطبيق قيد التنفيذ لهذا المتجر. انتظر حتى يكتمل.'}
            )

        version_name, version_code = next_version(store)
        icon = validated_data.get('app_icon')
        if icon is None:
            # Prefer catalog logo, then store logo — copy reference by re-saving file if present
            profile = getattr(store, 'catalog_profile', None)
            src = None
            if profile and profile.catalog_logo:
                src = profile.catalog_logo
            elif store.logo:
                src = store.logo
            build = StoreAppBuild(
                store=store,
                requested_by=user,
                app_name=app_name,
                store_url=store_url,
                primary_color=color,
                package_name=package_name_for_store(store),
                version_name=version_name,
                version_code=version_code,
            )
            if src:
                try:
                    build.app_icon.save(src.name.split('/')[-1], src, save=False)
                except Exception:  # noqa: BLE001
                    pass
            build.save()
            return build

        return StoreAppBuild.objects.create(
            store=store,
            requested_by=user,
            app_name=app_name,
            app_icon=icon,
            store_url=store_url,
            primary_color=color,
            package_name=package_name_for_store(store),
            version_name=version_name,
            version_code=version_code,
        )


class StoreAppStatusSerializer(serializers.Serializer):
    feature_enabled = serializers.BooleanField()
    can_generate = serializers.BooleanField()
    message = serializers.CharField(allow_blank=True)
    store_name = serializers.CharField()
    store_url = serializers.CharField(allow_null=True)
    default_app_name = serializers.CharField()
    default_color = serializers.CharField()
    catalog_slug = serializers.CharField(allow_null=True)
    latest_build = StoreAppBuildSerializer(allow_null=True)
