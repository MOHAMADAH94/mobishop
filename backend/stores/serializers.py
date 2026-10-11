from django.contrib.auth import get_user_model
from rest_framework import serializers

from core.role_permissions import (
    CONFIGURABLE_ROLES,
    DEFAULT_ROLE_PERMISSIONS,
    PERMISSION_LABELS,
    get_effective_permissions,
    validate_permission_list,
)
from stores.models import Employee, Role, Store, StoreCurrency, StoreMembership, StoreRolePermission, StoreSettings, Subscription
from stores.currencies import is_allowed_currency, normalize_currency
from stores.currency_service import ensure_base_currency_row, get_base_currency, rate_to_base_from_display
from stores.signals import seed_roles

User = get_user_model()


def validate_store_currency(value):
    code = normalize_currency(value)
    if not is_allowed_currency(code):
        raise serializers.ValidationError('اختر عملة من القائمة المعتمدة.')
    return code


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ('id', 'code', 'name', 'permissions')

    def to_representation(self, instance):
        data = super().to_representation(instance)
        name = (instance.name or '').strip()
        if not name or '?' in name:
            data['name'] = instance.get_code_display()
        store = self.context.get('store')
        if store:
            data['permissions'] = get_effective_permissions(store, instance)
        return data


class StoreRolePermissionSerializer(serializers.Serializer):
    role_code = serializers.ChoiceField(choices=CONFIGURABLE_ROLES)
    permissions = serializers.ListField(child=serializers.CharField(), allow_empty=True)

    def validate_permissions(self, value):
        try:
            return validate_permission_list(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def save(self):
        store = self.context['store']
        role = Role.objects.get(code=self.validated_data['role_code'])
        obj, _ = StoreRolePermission.objects.update_or_create(
            store=store,
            role=role,
            defaults={'permissions': self.validated_data['permissions']},
        )
        return obj


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ('status', 'trial_ends_at', 'expires_at')


class StoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = StoreSettings
        fields = ('tax_rate', 'low_stock_threshold', 'invoice_footer', 'invoice_prefix')


class StoreListSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    subscription = SubscriptionSerializer(read_only=True)

    class Meta:
        model = Store
        fields = (
            'id', 'name', 'business_type', 'currency', 'phone',
            'catalog_enabled', 'store_app_enabled', 'ai_assistant_enabled', 'is_active', 'created_at', 'role', 'subscription',
        )

    def get_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return None
        m = StoreMembership.objects.filter(store=obj, user=request.user, is_active=True).first()
        if not m:
            return None
        return RoleSerializer(m.role, context={'store': obj}).data


class StoreDetailSerializer(StoreListSerializer):
    settings = serializers.SerializerMethodField()
    base_currency = serializers.SerializerMethodField()

    class Meta(StoreListSerializer.Meta):
        fields = StoreListSerializer.Meta.fields + ('address', 'settings', 'base_currency')

    def get_base_currency(self, obj):
        return get_base_currency(obj)

    def get_settings(self, obj):
        settings, _ = StoreSettings.objects.get_or_create(store=obj)
        return StoreSettingsSerializer(settings).data


class StoreCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ('name', 'business_type', 'currency', 'phone', 'address')

    def validate_currency(self, value):
        return validate_store_currency(value)

    def validate(self, attrs):
        user = self.context['request'].user
        # المتجر الأول فقط عبر الـ API؛ أي متجر إضافي عبر Django Admin
        if Store.objects.filter(owner=user).exists():
            raise serializers.ValidationError(
                'لديك متجر بالفعل. لإضافة فرع إضافي تواصل مع الإدارة.'
            )
        if StoreMembership.objects.filter(user=user, is_active=True).exists():
            raise serializers.ValidationError(
                'حسابك مرتبط بمتجر بالفعل. لإضافة فرع إضافي تواصل مع الإدارة.'
            )
        return attrs

    def create(self, validated_data):
        user = self.context['request'].user
        validated_data['owner'] = user
        store = super().create(validated_data)
        if not Role.objects.filter(code=Role.Code.OWNER).exists():
            seed_roles()
        owner_role = Role.objects.filter(code=Role.Code.OWNER).first()
        if owner_role:
            StoreMembership.objects.get_or_create(
                store=store,
                user=user,
                defaults={'role': owner_role, 'is_active': True},
            )
        ensure_base_currency_row(store)
        return store


class StoreUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = ('name', 'business_type', 'currency', 'phone', 'address')

    def validate_currency(self, value):
        return validate_store_currency(value)

    def update(self, instance, validated_data):
        from decimal import Decimal

        old_currency = get_base_currency(instance)
        store = super().update(instance, validated_data)
        new_currency = get_base_currency(store)
        if old_currency != new_currency:
            ensure_base_currency_row(store)
            StoreCurrency.objects.filter(store=store, code=old_currency).delete()
            StoreCurrency.objects.update_or_create(
                store=store,
                code=new_currency,
                defaults={'rate_to_base': Decimal('1'), 'is_active': True},
            )
        return store


class StoreMembershipSerializer(serializers.ModelSerializer):
    user = serializers.SerializerMethodField()
    role = RoleSerializer(read_only=True)
    role_id = serializers.PrimaryKeyRelatedField(
        queryset=Role.objects.all(), source='role', write_only=True
    )

    class Meta:
        model = StoreMembership
        fields = ('id', 'user', 'role', 'role_id', 'is_active', 'joined_at')

    def get_user(self, obj):
        return {
            'id': obj.user.id,
            'username': obj.user.username,
            'full_name': obj.user.get_full_name() or obj.user.username,
            'email': obj.user.email,
        }


class EmployeeInviteSerializer(serializers.Serializer):
    email = serializers.EmailField()
    role_id = serializers.IntegerField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

    def validate_email(self, value):
        return value.lower()


class StoreCurrencyItemSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=10)
    is_active = serializers.BooleanField(default=True)
    display_rate = serializers.DecimalField(max_digits=18, decimal_places=6)
    rate_to_base = serializers.DecimalField(
        max_digits=18, decimal_places=6, required=False, write_only=True,
    )

    def validate_code(self, value):
        code = normalize_currency(value)
        if not is_allowed_currency(code):
            raise serializers.ValidationError('عملة غير معتمدة.')
        return code

    def validate(self, attrs):
        from decimal import Decimal

        store = self.context.get('store')
        base = get_base_currency(store) if store else None
        code = attrs['code']
        if base and code == base:
            attrs['rate_to_base'] = Decimal('1')
            return attrs
        if 'display_rate' in attrs:
            attrs['rate_to_base'] = rate_to_base_from_display(base, code, attrs['display_rate'])
        elif attrs.get('rate_to_base') is not None:
            attrs['rate_to_base'] = attrs['rate_to_base']
        else:
            raise serializers.ValidationError({'display_rate': 'أدخل سعر الصرف.'})
        return attrs


class StoreCurrenciesUpdateSerializer(serializers.Serializer):
    currencies = StoreCurrencyItemSerializer(many=True)

    def validate_currencies(self, value):
        if not value:
            raise serializers.ValidationError('أضف عملة واحدة على الأقل.')
        codes = [item['code'] for item in value]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError('لا يمكن تكرار نفس العملة.')
        return value

    def save(self):
        from decimal import Decimal

        store = self.context['store']
        user = self.context.get('user')
        base = get_base_currency(store)
        submitted = {item['code']: item for item in self.validated_data['currencies']}

        if base not in submitted:
            raise serializers.ValidationError(
                {'currencies': f'يجب تضمين العملة الأساسية ({base}).'}
            )
        if submitted[base]['rate_to_base'] != Decimal('1'):
            raise serializers.ValidationError(
                {'currencies': f'سعر العملة الأساسية ({base}) يجب أن يكون 1.'}
            )

        for code, item in submitted.items():
            StoreCurrency.objects.update_or_create(
                store=store,
                code=code,
                defaults={
                    'is_active': item['is_active'],
                    'rate_to_base': item['rate_to_base'],
                    'updated_by': user,
                },
            )

        StoreCurrency.objects.filter(store=store).exclude(code__in=submitted).delete()
        return serialize_currencies(store)


def serialize_currencies(store):
    from stores.currency_service import serialize_currencies as _serialize
    return _serialize(store)
