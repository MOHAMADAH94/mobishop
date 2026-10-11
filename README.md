# موبي شوب (Mobishop)

نظام SaaS لإدارة محلات الموبايلات — React + Django + PostgreSQL/SQLite

## الميزات الرئيسية

### إدارة المتجر
- تسجيل مستخدمين وتسجيل دخول JWT
- متاجر متعددة مع عزل بيانات (Multi-tenant) عبر `X-Store-Id`
- أدوار وصلاحيات: مالك، مدير، كاشير، فني
- اشتراك تجريبي / نشط
- عملات متعددة وأسعار صرف
- واجهة عربية RTL مع وضع ليلي/نهاري

### المخزون والبيع
- منتجات، تصنيفات، باركود، IMEI، صور
- نقطة بيع (POS) وفواتير PDF
- سجل مخزون، موردون، مشتريات
- عملاء وديون، صيانة، مصاريف

### مركز الأعمال الذكي
- **مركز القرارات** — تنبيهات مخزون (نافذ / منخفض)
- **تحليل الأرباح** — تقارير PDF/Excel بدعم العربية
- **المساعد الذكي** — أسئلة مقترحة وتحليلات سريعة

### معرض المتجر (Store Catalog)
- تفعيل لكل متجر من Super Admin (`catalog_enabled`)
- إعدادات المعرض للمالك: slug، شعار، بانر، تواصل، نشر المنتجات
- صفحات عامة: `/shop/{slug}` — تصنيفات، منتجات، عروض
- تصنيفات المعرض: إظهار/إخفاء، مميز، slug (عربي/إنجليزي)

### السوق العام (Marketplace)
- `/marketplace` — الرئيسية (متاجر مميزة، منتجات، عروض)
- `/marketplace/stores` — دليل المتاجر
- `/marketplace/products` — كل المنتجات + فلاتر
- `/marketplace/offers` — العروض
- `/product/{catalog_slug}` — تفاصيل منتج + تواصل (واتساب/Telegram/اتصال)
- متاجر مميزة (`featured`) من Django Admin
- إحصائيات مشاهدات للمالك في إعدادات المعرض

---

## التشغيل المحلي

**يجب تشغيل Backend و Frontend معاً.**

### Backend (منفذ 8000)

```powershell
cd backend
python manage.py migrate
python manage.py runserver 8000
```

### Frontend (منفذ 5173)

```powershell
cd frontend
npm install
npm run dev
```

افتح: http://localhost:5173

**صفحات عامة للتجربة:**
- http://localhost:5173/marketplace
- http://localhost:5173/shop/{store-slug}

> `frontend/.env` يستخدم `VITE_API_URL=/api` (Vite proxy → Django). بعد تغيير `.env` أعد تشغيل `npm run dev`.

---

## هيكل المشروع

```
mobishop/
├── backend/
│   ├── catalog/        # معرض المتجر
│   ├── marketplace/    # السوق العام + إحصائيات
│   ├── intelligence/   # مركز القرارات + تحليل الأرباح
│   ├── assistant/      # المساعد الذكي
│   ├── stores/         # متاجر، أدوار، عملات
│   ├── products/       # منتجات، تصنيفات، مخزون
│   └── sales/          # فواتير، POS
├── frontend/           # React + Vite + Tailwind
└── deploy/             # ZIP للنشر + UPDATE-SERVER.md
```

---

## API — أمثلة

| المسار | الوصف |
|--------|--------|
| `POST /api/auth/login/` | تسجيل الدخول |
| `GET /api/stores/` | متاجري |
| `GET /api/stores/catalog/` | إعدادات المعرض (مالك) |
| `GET /api/stores/marketplace-analytics/` | إحصائيات السوق (مالك) |
| `GET /api/public/marketplace/` | الرئيسية — السوق العام |
| `GET /api/public/shop/{slug}/` | معرض متجر — تصنيفات |
| `GET /api/public/marketplace/products/{slug}/` | تفاصيل منتج |

**مهم:** أرسل هيدر `Authorization` و `X-Store-Id` للطلبات المحمية.

---

## Super Admin (Django Admin)

| الإعداد | الغرض |
|---------|--------|
| `Store.catalog_enabled` | تفعيل معرض/Sوق للمتجر |
| `StoreCatalogProfile.featured` | متجر مميز في السوق |
| `StoreCatalogProfile.is_public` | نشر المعرض (يضبطه المالك أيضاً) |

---

## النشر

راجع [deploy/UPDATE-SERVER.md](deploy/UPDATE-SERVER.md) و [deploy/FEATURES-AND-UPDATES.md](deploy/FEATURES-AND-UPDATES.md).

```powershell
.\deploy\prepare-deploy.ps1
```

الملفات الجاهزة في `deploy/out/`:
- `backend-full.zip`
- `frontend-full.zip`
- `BUILD_INFO.txt`
- `FEATURES-AND-UPDATES.md`
- `UPDATE-SERVER.md`

---

## الترخيص

خاص — للاستخدام حسب اتفاقك.
