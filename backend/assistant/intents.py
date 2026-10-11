"""Intent detection for the smart assistant (internal only)."""

from __future__ import annotations

import re

# High-level categories from product requirements
CATEGORY_HOW_TO = 'HOW_TO'
CATEGORY_TROUBLESHOOTING = 'TROUBLESHOOTING'
CATEGORY_STORE_ANALYSIS = 'STORE_ANALYSIS'
CATEGORY_SALES_ANALYSIS = 'SALES_ANALYSIS'
CATEGORY_INVENTORY = 'INVENTORY'
CATEGORY_CUSTOMER_DEBTS = 'CUSTOMER_DEBTS'
CATEGORY_MAINTENANCE = 'MAINTENANCE'
CATEGORY_PRODUCT_INFORMATION = 'PRODUCT_INFORMATION'
CATEGORY_SUBSCRIPTION = 'SUBSCRIPTION'
CATEGORY_SUPPORT_REQUEST = 'SUPPORT_REQUEST'
CATEGORY_GENERAL = 'GENERAL_MOBISHOP_QUESTION'
CATEGORY_UNKNOWN = 'UNKNOWN'

# Ordered: more specific first
_CATEGORY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    (CATEGORY_SUPPORT_REQUEST, (
        r'لدي\s+مشكلة', r'مشكلة\s+في', r'تواصل\s+مع\s+الدعم', r'support\s+request',
        r'افتح\s+تذكرة', r'طلب\s+دعم', r'contact\s+support', r'escalate',
    )),
    (CATEGORY_TROUBLESHOOTING, (
        r'لماذا\s+لا', r'لا\s+يظهر', r'لا\s+أجد', r'مش\s+ظاهر', r'لا\s+يعمل',
        r'خطأ', r'فشل', r'why\s+(isn|doesn|can.t)', r'not\s+showing', r'troubleshoot',
    )),
    (CATEGORY_HOW_TO, (
        # Specific how-to verbs only — avoid matching «كيف اتعامل / كيفك»
        r'كيف\s+(?:أضيف|اضيف|أنشئ|انشئ|أسجل|اسجل|أبيع|ابيع|أفتح|افتح|أفعّل|افعل|أفعّل|أستخدم|استخدم)',
        r'طريقة\s+(?:إضافة|انشاء|إنشاء|البيع|الاستخدام)',
        r'كيف\s+أستخدم', r'how\s+(?:do|to|can)\s+i',
        r'علّمني\s+', r'علمني\s+',
        r'استخدم\s+موبي', r'استخدام\s+موبي',
    )),
    (CATEGORY_SUBSCRIPTION, (
        r'اشتراك', r'تجريب', r'subscription', r'trial', r'انتهى\s+الاشتراك',
    )),
    (CATEGORY_CUSTOMER_DEBTS, (
        r'ديون', r'دين\s+', r'debt', r'مستحقات\s+عميل',
    )),
    (CATEGORY_MAINTENANCE, (
        r'صيان', r'repair', r'تذكرة\s+صيان', r'أجهزة\s+صيان',
    )),
    (CATEGORY_INVENTORY, (
        r'مخزون', r'منخفض', r'راكد', r'stock', r'inventory', r'نفاد', r'كمية',
    )),
    (CATEGORY_SALES_ANALYSIS, (
        r'مبيعات', r'فاتور', r'إيراد', r'sales', r'revenue', r'قارن\s+.*شهر',
        r'أفضل\s+.*مبيع', r'أكثر\s+.*مبيع',
    )),
    (CATEGORY_STORE_ANALYSIS, (
        r'ملخص\s+متجر', r'ماذا\s+يحدث', r'insights', r'ملخص\s+اليوم',
        r'store\s+summary', r'ماذا\s+يجب\s+.*انتباه', r'تحليل\s+متجر',
        r'وضع\s+متجر', r'حالة\s+متجر', r'أداء\s+متجر', r'how\s+is\s+my\s+store',
    )),
    (CATEGORY_PRODUCT_INFORMATION, (
        r'منتج', r'product', r'باركود', r'imei',
    )),
]


def _norm(text: str) -> str:
    text = (text or '').strip().lower()
    text = re.sub(r'[^\w\s\u0600-\u06FF?؟]', ' ', text)
    return re.sub(r'\s+', ' ', text)


def detect_category(question: str) -> str:
    q = _norm(question)
    for category, patterns in _CATEGORY_PATTERNS:
        for pattern in patterns:
            if re.search(pattern, q):
                return category
    return CATEGORY_UNKNOWN


def tools_for_category(category: str) -> list[str]:
    mapping = {
        CATEGORY_STORE_ANALYSIS: ['get_store_summary', 'get_today_sales', 'get_inventory_summary'],
        CATEGORY_SALES_ANALYSIS: ['get_sales_summary', 'get_top_selling_products', 'compare_month_sales'],
        CATEGORY_INVENTORY: ['get_low_stock_products', 'get_inventory_summary'],
        CATEGORY_CUSTOMER_DEBTS: ['get_customer_debts'],
        CATEGORY_MAINTENANCE: ['get_maintenance_summary'],
        CATEGORY_PRODUCT_INFORMATION: ['get_low_stock_products', 'get_top_selling_products'],
    }
    return mapping.get(category, [])
