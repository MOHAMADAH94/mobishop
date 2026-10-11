# تحديث Mobishop على السيرفر

> راجع أيضاً [FEATURES-AND-UPDATES.md](FEATURES-AND-UPDATES.md) لقائمة الميزات الكاملة.

## التحقق السريع

1. افتح https://mobishop.online → `Ctrl+U` — اسم `index-*.js` يطابق `BUILD_INFO.txt`
2. افتح https://mobishop.online/marketplace — يجب أن تظهر الصفحة
3. API: https://api.mobishop.online/api/health/ → `{"status":"ok"}`

---

## 1) Backend — `api.mobishop.online`

المجلد: `~/api.mobishop.online`

1. ارفع `backend-full.zip`
2. **Extract** في نفس المجلد — `manage.py` مباشرة هنا (ليس داخل مجلد فرعي)
3. **لا تحذف** `.env`
4. Terminal:

```bash
source ~/virtualenv/api.mobishop.online/3.11/bin/activate
cd ~/api.mobishop.online
bash ~/update-after-upload.sh
```

أو يدوياً:

```bash
pip install -r requirements-hosting.txt -q
python manage.py migrate --noinput
python manage.py fix_roles
python manage.py generate_recommendations
touch tmp/restart.txt
```

5. cPanel → **Setup Python App** → **Restart**

### Super Admin بعد التحديث

- `/admin/` → **Stores** → فعّل **Catalog enabled** للمتاجر المطلوبة
- `/admin/` → **Catalog profiles** → **Featured** للمتاجر المميزة في السوق
- تأكد أن مجلد **media/** قابل للكتابة (صور المنتجات والمعرض)

---

## 2) Frontend — `public_html`

1. ارفع `frontend-full.zip` إلى `~/public_html`
2. **Extract** — `index.html` في جذر `public_html`
3. تأكد من `.htaccess` (يُضمَّن في ZIP)
4. المتصفح: `Ctrl+Shift+R`

### Routes جديدة يجب أن تعمل

- `/marketplace`
- `/marketplace/stores`
- `/marketplace/products`
- `/marketplace/offers`
- `/product/{slug}`
- `/shop/{store-slug}`
- `/cashbox` — صندوق العملات (رصيد نقدي لكل عملة)

---

## 3) أخطاء شائعة

| الخطأ | الحل |
|-------|------|
| رفع ZIP بدون استخراج | Extract ثم Restart |
| استخراج داخل مجلد فرعي | `index.html` يجب في جذر public_html |
| بدون `migrate` | صيانة/صندوق/Marketplace/منتجات غير نشطة → مشاكل |
| منتجات قديمة لا تظهر | بعد الرفع شغّل `migrate` (يطبّق `products.0009`) أو `activate_inactive_products` |
| بدون Restart Python | API قديم |
| استبدال `.env` | **لا تحذف ولا تستبدل** — الإعدادات الحالية تبقى |
| حذف `media/` | الصور تختفي — اترك المجلد كما هو |
| `catalog_enabled = false` | المعرض والسوق لا يظهر المتجر |
| منتجات غير منشورة | فعّل «نشر في المعرض» من المنتجات |
| كاش المتصفح | `Ctrl+Shift+R` |

---

## 4) خطأ 500

```bash
cd ~/api.mobishop.online
bash fix-api-500.sh
```

ثم **Setup Python App → Restart**.

---

## 5) ملفات deploy/out

| الملف | الغرض |
|-------|--------|
| `backend-full.zip` | Backend كامل |
| `frontend-full.zip` | Frontend مبني |
| `BUILD_INFO.txt` | رقم الب build + bundle |
| `FEATURES-AND-UPDATES.md` | تقرير الميزات |
| `update-after-upload.sh` | سكربت ما بعد الرفع |
