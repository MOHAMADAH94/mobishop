"""Helpers for resolving store URL, package id, and app name validation."""

from __future__ import annotations

import re

from django.conf import settings

from catalog.features import get_catalog_profile, is_public_catalog_live
from store_app.features import is_store_app_feature_enabled


APP_NAME_MAX = 50
APP_NAME_RE = re.compile(r'^[\w\s\u0600-\u06FF.\-]+$', re.UNICODE)
COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')
MAX_ICON_BYTES = 2 * 1024 * 1024  # 2 MB
ALLOWED_ICON_CONTENT_TYPES = {'image/png', 'image/jpeg', 'image/webp'}


def public_shop_base_url() -> str:
    return getattr(settings, 'STORE_APP_PUBLIC_BASE_URL', 'https://mobishop.online').rstrip('/')


def resolve_store_url(store) -> str | None:
    """Always derived server-side from the store catalog slug — never from client input."""
    profile = get_catalog_profile(store)
    if not profile or not profile.slug:
        return None
    return f'{public_shop_base_url()}/shop/{profile.slug}?app=1'


def package_name_for_store(store) -> str:
    return f'com.mobishop.store.s{int(store.pk)}'


def next_version(store) -> tuple[str, int]:
    from store_app.models import StoreAppBuild

    last = (
        StoreAppBuild.objects.filter(store=store)
        .order_by('-version_code')
        .values_list('version_code', flat=True)
        .first()
    )
    code = int(last or 0) + 1
    # 1.0.0, 1.0.1, ... then 1.1.0 after 99 patches of minor — keep simple: 1.0.{n-1}
    name = f'1.0.{code - 1}'
    return name, code


def sanitize_app_name(raw: str, fallback: str = '') -> str:
    name = (raw or '').strip()
    if not name:
        name = (fallback or '').strip() or 'متجري'
    name = re.sub(r'\s+', ' ', name)[:APP_NAME_MAX]
    if not APP_NAME_RE.match(name):
        raise ValueError('اسم التطبيق يحتوي أحرفاً غير مسموحة.')
    return name


def sanitize_color(raw: str | None, fallback: str = '#0F766E') -> str:
    color = (raw or '').strip() or fallback
    if not COLOR_RE.match(color):
        raise ValueError('لون التطبيق غير صالح. استخدم صيغة مثل #0F766E')
    return color.upper()


def validate_icon_upload(uploaded) -> None:
    if uploaded is None:
        return
    content_type = getattr(uploaded, 'content_type', '') or ''
    name = (getattr(uploaded, 'name', '') or '').lower()
    if content_type not in ALLOWED_ICON_CONTENT_TYPES and not name.endswith(('.png', '.jpg', '.jpeg', '.webp')):
        raise ValueError('صيغة الأيقونة غير مدعومة. استخدم PNG أو JPG.')
    size = getattr(uploaded, 'size', 0) or 0
    if size > MAX_ICON_BYTES:
        raise ValueError('حجم الأيقونة كبير جداً (الحد الأقصى 2 ميغابايت).')


def can_generate_for_store(store) -> tuple[bool, str]:
    if not is_store_app_feature_enabled(store):
        return False, 'ميزة تطبيق المتجر غير متاحة ضمن اشتراكك الحالي.'
    if not is_public_catalog_live(store):
        return False, 'فعّل معرض المتجر العام وحدّد الرابط (slug) قبل إنشاء التطبيق.'
    if not resolve_store_url(store):
        return False, 'رابط المتجر غير متوفر. أكمل إعدادات المعرض أولاً.'
    return True, ''


def ensure_apk_dir_protected() -> None:
    """Write Apache rules so APKs cannot be downloaded from /media/ directly."""
    from pathlib import Path

    folder = Path(settings.MEDIA_ROOT) / 'store_apps' / 'apks'
    try:
        folder.mkdir(parents=True, exist_ok=True)
        htaccess = folder / '.htaccess'
        content = (
            '# Store APKs are served only via authenticated /api/store-app/builds/<id>/download/\n'
            'Require all denied\n'
            'Deny from all\n'
        )
        if not htaccess.exists() or htaccess.read_text(encoding='utf-8') != content:
            htaccess.write_text(content, encoding='utf-8')
    except OSError:
        pass
