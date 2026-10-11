# تطبيق متجرك — Store Android App Generator

ميزة معزولة: توليد APK WebView لمتجر المالك فقط.

## تفعيل للمنصة

1. Django Admin → Stores → فعّل **Store app enabled** للمتجر
2. تأكد أن المعرض العام مفعّل وله slug
3. المالك: القائمة → المعرض → **تطبيق متجرك**

## متغيرات البيئة

| Variable | Default | معنى |
|----------|---------|------|
| `STORE_APP_PUBLIC_BASE_URL` | `https://mobishop.online` | أساس رابط المتجر داخل WebView |
| `STORE_APP_MOCK_BUILD` | `true` | `true` = APK تجريبي بدون Android SDK (اختبار/استضافة مشتركة) |
| `STORE_APP_BUILD_INLINE` | `true` | تشغيل البناء في خيط خلفي بعد الطلب |
| `STORE_APP_ANDROID_TEMPLATE_DIR` | (قالب مدمج) | مسار قالب Android اختياري |
| `STORE_APP_BUILD_TIMEOUT` | `900` | مهلة Gradle بالثواني |

للبناء الحقيقي على خادم منفصل:

```bash
STORE_APP_MOCK_BUILD=false
STORE_APP_BUILD_INLINE=false
# cron كل دقيقة:
python manage.py process_store_app_builds --limit 2
```

يتطلب JDK 17 + Android SDK + Gradle wrapper في القالب.

## API

- `GET /api/store-app/status/`
- `GET|POST /api/store-app/builds/`
- `GET /api/store-app/builds/<id>/`
- `GET /api/store-app/builds/<id>/download/`
- `POST /api/store-app/builds/<id>/retry/`

كل الطلبات تتطلب JWT + `X-Store-Id` + دور مالك المتجر.
الـ `store_url` يُشتق من slug المعرض على السيرفر فقط.
