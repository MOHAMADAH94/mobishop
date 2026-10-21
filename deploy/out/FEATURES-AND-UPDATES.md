# تقرير الميزات والتحديثات — Mobishop

> آخر تحديث للوثيقة: **2026-10-21**  
> آخر build: راجع `deploy/out/BUILD_INFO.txt`

---

## 0. تحديث 2026-10-21 — سعر الشراء 4 منازل + عميل سريع في POS

### سعر الشراء
- `Product.buy_price` وتكلفة المشتريات حتى **4** منازل عشرية
- **Migrations:** `products.0013`, `purchases.0007`, `sales.0014`

### عميل سريع عند الآجل
- في نقطة البيع: زر «عميل جديد» / «إضافة سريعة» (اسم + هاتف)
- مسموح للكاشير عبر صلاحية `pos`

---

## 0b. تحديث 2026-10-13 — سعر البيع + الكمية حتى 4 منازل عشرية

### إصلاح POS (السعر + الدفع)
- حقل السعر ومبلغ السطر والإجمالي والمدفوعات: حتى **4** منازل عشرية
- **Migrations:** `sales.0013`, `customers.0004`

### سعر البيع
- `Product.sell_price` و`SaleItem.unit_price`: حتى **4** منازل عشرية
- الإدخال في بطاقة المنتج وPOS؛ العرض يظهر منزلتين كحد أدنى وحتى 4 عند الحاجة
- **Migrations:** `products.0012`, `sales.0012`

### الكمية الكسرية
- اختيار دقة الكمية في بطاقة المنتج: **0–4**
- حقول الكمية: `decimal_places=4`
- **Migrations:** `products.0011`, `sales.0011`, `purchases.0006`

---

## 0b. تحديث 2026-10-12 — حذف حساب تجريبي من لوحة الأدمن

في Django Admin (superuser فقط):

| الموقع | الإجراء |
|--------|---------|
| **المستخدمون** | «حذف الحساب والمتاجر المرتبطة نهائياً» |
| **المتاجر** | «حذف المتجر (+ المالك إن لم يعد له متاجر)» |

- يحذف المتاجر المملوكة وكل بيانات CASCADE (اشتراك، منتجات، مبيعات، …) ثم المستخدم داخل معاملة واحدة
- يحذف أيضاً حسابات الأعضاء المرتبطين فقط بتلك المتاجر
- تأكيد بكتابة `DELETE`؛ لا يحذف حسابك الحالي ولا staff/superuser
- لا يحتاج migrations جديدة؛ بعد الرفع: `migrate` (إن وُجد معلّق) + `touch tmp/restart.txt`

---

## 1. ملخص المنصة

| الوحدة | الوصف |
|--------|--------|
| **إدارة المتجر** | POS، منتجات، مخزون، عملاء، موردون، مشتريات، صيانة، مصاريف، صندوق عملات |
| **مركز الأعمال الذكي** | قرارات، أرباح، مساعد ذكي |
| **معرض المتجر** | معرض عام لكل متجر `/shop/{slug}` |
| **السوق العام** | marketplace موحّد `/marketplace` |

---

## 2. السوق العام (Marketplace)

### صفحات الزائر

| Route | المحتوى |
|-------|---------|
| `/marketplace` | متاجر مميزة، جديدة، أحدث منتجات، عروض |
| `/marketplace/stores` | دليل المتاجر + بحث |
| `/marketplace/products` | كل المنتجات + فلاتر (متجر، تصنيف، توفر) |
| `/marketplace/offers` | عروض كل المتاجر |
| `/product/{catalog_slug}` | تفاصيل منتج + تواصل |

### API

```
GET /api/public/marketplace/
GET /api/public/marketplace/stores/?q=
GET /api/public/marketplace/products/?q=&store=&category=&availability=
GET /api/public/marketplace/offers/
GET /api/public/marketplace/products/{catalog_slug}/
```

### متاجر مميزة

- Super Admin → **Catalog profiles** → `featured = true`
- تظهر أولاً في الرئيسية ودليل المتاجر

### إحصائيات (للمالك)

- `GET /api/stores/marketplace-analytics/`
- مشاهدات المتجر، مشاهدات المنتجات، أكثر المنتجات مشاهدة
- تظهر في **معرض المتجر → إعدادات**

---

## 3. معرض المتجر (Store Catalog)

### التفعيل (3 طبقات)

1. **Super Admin:** `Store.catalog_enabled = true`
2. **المالك:** `/catalog/settings` — slug + تفعيل المعرض العام
3. **المنتجات:** `publish_in_catalog = true` لكل منتج

### صفحات المتجر

| Route | المحتوى |
|-------|---------|
| `/shop/{slug}` | الرئيسية — شبكة التصنيفات |
| `/shop/{slug}/category/{category_slug}` | منتجات تصنيف |
| `/shop/{slug}/products` | كل المنتجات + بحث |
| `/shop/{slug}/offers` | عروض المتجر |
| `/shop/{slug}/product/{id}` | تفاصيل (legacy) |

### تصنيفات المعرض

- إظهار/إخفاء من المعرض (`show_in_catalog`)
- تصنيف مميز (`featured`) — يظهر أولاً
- slug عربي أو إنجليزي مدعوم
- **بدون صور** في المعرض حالياً (نص فقط)

### أمان البيانات العامة

الزائر **لا يرى:** الكميات، سعر الشراء، الموردين، ملاحظات داخلية، بيانات عملاء.

---

## 4. مركز الأعمال الذكي

| الميزة | المسار |
|--------|--------|
| مركز القرارات | `/smart-business/decision-center` |
| تحليل الأرباح | `/smart-business/profit-intelligence` |
| المساعد الذكي | `/smart-business/assistant` |

- تنبيهات: نفاد المخزون (0) + مخزون منخفض
- تصدير PDF/Excel بالعربية (RTL)
- أسئلة مقترحة في المساعد الذكي

---

## 5. إدارة المتجر (Core)

- Multi-tenant + JWT
- أدوار: owner, manager, cashier, technician
- صلاحيات قابلة للتخصيص لكل متجر
- عملات متعددة + **صندوق العملات** `/cashbox`
- موردون + فواتير شراء
- IMEI + باركود + مسح كاميرا
- فواتير PDF (زائر/نقدي آمن مع IMEI)
- دفعات ديون: فواتير + صيانة + لوحة العميل

---

## 6. سجل التحديثات

### 2026-09-28 — إصلاح جذري لـ is_active على المنتجات

- إنشاء المنتج دائماً بـ `is_active=True` (model + serializer + view) — العميل لا يستطيع تمرير `false`
- إصلاح FormData/`Content-Type` عند رفع صورة (حسابات المعرض)
- قائمة المنتجات: فلتر نشط/غير نشط + «استعادة المحدد»
- Migration `products.0009_reactivate_inactive_products` تفعّل كل المنتجات غير النشطة عند `migrate`
- أمر اختياري: `python manage.py activate_inactive_products`

### 2026-09-27 — إصلاحات تشغيلية + صندوق العملات

- **PDF:** إصلاح انهيار الفواتير بدون عميل / مع IMEI (reshape بدون كسر HTML) + رسائل خطأ أوضح
- **الصيانة:** `debt_posted` مرة واحدة عند التسليم، عكس عند الإلغاء، تحصيل عند التسليم، `RepairPayment` + `record-payment`
- **العملاء:** تسجيل دفعة على فاتورة/تذكرة؛ منع تعديل `debt` مباشرة من API الكتابة
- **المنتجات:** `localTempId` دون اتصال + قائمة المنتجات من Dexie عند انقطاع الشبكة
- **صندوق العملات:** `GET/POST /api/stores/cashbox/` + صفحة `/cashbox` (رصيد افتتاحي + نقد داخل/خارج لكل عملة)
- Migrations: `repairs.0005_debt_posted_and_payments`, `stores.0013_opening_cash_balance`
- **توافق السيرفر:** لا يُستبدل `.env` ولا `media/`؛ شغّل `migrate` بعد الرفع

### 2026-06-20 — Marketplace + Catalog Categories

- إطلاق **السوق العام** (`marketplace` app)
- تصنيفات المعرض: تنقل، slug، مميز، إخفاء
- إصلاح 404 للتصنيفات العربية
- إزالة صور التصنيفات من المعرض
- `catalog_slug` للمنتجات + SEO
- `featured` للمتاجر
- تتبع مشاهدات `MarketplaceView`

### 2026-06-12 — Store Catalog

- `catalog_enabled` per store
- إعدادات المعرض للمالك
- نشر المنتجات + صور
- routes عامة `/shop/*`

### 2026-06 — Smart Business

- مركز القرارات + تحليل الأرباح + مساعد ذكي
- تحسينات لوحة التحكم
- تصدير عربي

---

## 7. جاهزية مستقبلية

| المرحلة | المخطط |
|---------|--------|
| Phase 2 | متابعون، مفضلة |
| Phase 3 | سلة، طلبات |
| Phase 4 | دفع إلكتروني |
| Catalog | تصنيفات فرعية، بانرات تصنيف، SEO |

البنية الحالية (`catalog/features.py`, `marketplace` منفصل) تدعم الربط بخطط اشتراك لاحقاً.

---

## 8. بعد كل رفع على السيرفر

```bash
# لا تحذف .env ولا media
pip install -r requirements-hosting.txt
python manage.py migrate --noinput
python manage.py fix_roles
python manage.py generate_recommendations
touch tmp/restart.txt
```

**Migrate مهم لـ:** `products.0009` (تفعيل منتجات كانت `is_active=0`)، `repairs` (debt_posted, RepairPayment), `stores` (opening_cash_balance / ai_assistant)، بالإضافة لـ catalog/marketplace إن لم تُطبَّق سابقاً.
