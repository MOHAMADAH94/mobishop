"""Supported ISO 4217 currency codes for stores."""

ALLOWED_CURRENCY_CODES = frozenset({
    'USD',  # US Dollar
    'EUR',  # Euro
    'GBP',  # British Pound
    'SAR',  # Saudi Riyal
    'AED',  # UAE Dirham
    'KWD',  # Kuwaiti Dinar
    'QAR',  # Qatari Riyal
    'BHD',  # Bahraini Dinar
    'OMR',  # Omani Rial
    'EGP',  # Egyptian Pound
    'JOD',  # Jordanian Dinar
    'LBP',  # Lebanese Pound
    'IQD',  # Iraqi Dinar
    'SYP',  # Syrian Pound
    'YER',  # Yemeni Rial
    'MAD',  # Moroccan Dirham
    'TND',  # Tunisian Dinar
    'DZD',  # Algerian Dinar
    'LYD',  # Libyan Dinar
    'SDG',  # Sudanese Pound
    'TRY',  # Turkish Lira
})

CURRENCY_LABELS = {
    'USD': 'USD — دولار أمريكي',
    'EUR': 'EUR — يورو',
    'GBP': 'GBP — جنيه إسترليني',
    'SAR': 'SAR — ريال سعودي',
    'AED': 'AED — درهم إماراتي',
    'KWD': 'KWD — دينار كويتي',
    'QAR': 'QAR — ريال قطري',
    'BHD': 'BHD — دينار بحريني',
    'OMR': 'OMR — ريال عماني',
    'EGP': 'EGP — جنيه مصري',
    'JOD': 'JOD — دينار أردني',
    'LBP': 'LBP — ليرة لبنانية',
    'IQD': 'IQD — دينار عراقي',
    'SYP': 'SYP — ليرة سورية',
    'YER': 'YER — ريال يمني',
    'MAD': 'MAD — درهم مغربي',
    'TND': 'TND — دينار تونسي',
    'DZD': 'DZD — دينار جزائري',
    'LYD': 'LYD — دينار ليبي',
    'SDG': 'SDG — جنيه سوداني',
    'TRY': 'TRY — ليرة تركية',
}

DEFAULT_CURRENCY = 'USD'

# عملات «صلبة» تُعرض بصيغة: 1 من هذه العملة = X من الأساس (مثل 1 USD = 15000 SYP)
HARD_CURRENCY_CODES = frozenset({
    'USD', 'EUR', 'GBP', 'CHF',
    'KWD', 'BHD', 'OMR', 'JOD',
    'SAR', 'AED', 'QAR',
})


def normalize_currency(value: str) -> str:
    return (value or '').strip().upper()


def is_allowed_currency(value: str) -> bool:
    return normalize_currency(value) in ALLOWED_CURRENCY_CODES


def is_hard_currency(value: str) -> bool:
    return normalize_currency(value) in HARD_CURRENCY_CODES
