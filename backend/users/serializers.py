from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'phone')
        read_only_fields = ('id',)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = (
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'phone',
        )
        extra_kwargs = {
            'username': {
                'error_messages': {
                    'unique': 'اسم المستخدم مستخدم مسبقاً.',
                    'required': 'اسم المستخدم مطلوب.',
                    'blank': 'اسم المستخدم مطلوب.',
                },
            },
            'email': {
                'error_messages': {
                    'required': 'البريد الإلكتروني مطلوب.',
                    'blank': 'البريد الإلكتروني مطلوب.',
                    'invalid': 'أدخل بريداً إلكترونياً صالحاً.',
                },
            },
        }

    def validate_username(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('اسم المستخدم مطلوب.')
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('اسم المستخدم مستخدم مسبقاً.')
        return value

    def validate_email(self, value):
        value = (value or '').strip().lower()
        if not value:
            raise serializers.ValidationError('البريد الإلكتروني مطلوب.')
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('هذا البريد الإلكتروني مستخدم مسبقاً.')
        return value

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'كلمات المرور غير متطابقة.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user
