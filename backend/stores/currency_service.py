"""Central currency conversion and validation for multi-currency stores."""

from decimal import Decimal, ROUND_HALF_UP

from rest_framework.exceptions import ValidationError

from stores.currencies import is_allowed_currency, is_hard_currency, normalize_currency
from stores.models import StoreCurrency

TWOPLACES = Decimal('0.01')
RATE_PLACES = Decimal('0.0000000001')  # 10 خانات داخلية لسعر الصرف
QUANTIZE = ROUND_HALF_UP


def quantize_money(value) -> Decimal:
    """تقريب المبالغ المالية إلى خانتين عشريتين."""
    return Decimal(str(value)).quantize(TWOPLACES, rounding=QUANTIZE)


def quantize_rate(value) -> Decimal:
    """تقريب سعر الصرف الداخلي (لا يُعرض للمستخدم)."""
    return Decimal(str(value)).quantize(RATE_PLACES, rounding=QUANTIZE)


def uses_currency_to_base_quote(currency_code: str, base_currency: str) -> bool:
    """True → user enters: 1 {currency} = X {base}. False → 1 {base} = X {currency}."""
    code = normalize_currency(currency_code)
    base = normalize_currency(base_currency)
    if code == base:
        return True
    return is_hard_currency(code)


def rate_to_base_from_display(base_currency: str, currency_code: str, display_value) -> Decimal:
    """Convert user-facing exchange rate to internal rate_to_base."""
    display = Decimal(str(display_value))
    if display <= 0:
        raise ValidationError('سعر الصرف يجب أن يكون أكبر من صفر.')
    if uses_currency_to_base_quote(currency_code, base_currency):
        return quantize_rate(display)
    return quantize_rate(Decimal('1') / display)


def display_rate_from_internal(base_currency: str, currency_code: str, rate_to_base) -> Decimal:
    """Convert stored rate_to_base to user-facing exchange rate."""
    rtb = Decimal(str(rate_to_base))
    if rtb <= 0:
        return Decimal('0')
    if uses_currency_to_base_quote(currency_code, base_currency):
        value = rtb
    else:
        value = Decimal('1') / rtb
    if value >= Decimal('100'):
        return value.quantize(Decimal('1'), rounding=QUANTIZE)
    return value.quantize(TWOPLACES, rounding=QUANTIZE)


def rate_quote_label(base_currency: str, currency_code: str) -> str:
    base = normalize_currency(base_currency)
    code = normalize_currency(currency_code)
    if uses_currency_to_base_quote(code, base):
        return f'1 {code} = … {base}'
    return f'1 {base} = … {code}'


def get_base_currency(store) -> str:
    return normalize_currency(store.currency)


def ensure_base_currency_row(store):
    """Ensure the store's base currency exists in StoreCurrency."""
    base = get_base_currency(store)
    StoreCurrency.objects.get_or_create(
        store=store,
        code=base,
        defaults={'rate_to_base': Decimal('1'), 'is_active': True},
    )


def get_active_currencies(store):
    ensure_base_currency_row(store)
    return StoreCurrency.objects.filter(store=store, is_active=True).order_by('code')


def get_rate_to_base(store, currency_code, rate_override=None) -> Decimal:
    """
    How many base-currency units equal 1 unit of `currency_code`.
    Example: base=SYP, USD rate=15000 → 1 USD = 15000 SYP.
    """
    code = normalize_currency(currency_code)
    base = get_base_currency(store)
    if code == base:
        return Decimal('1')
    if rate_override is not None:
        rate = quantize_rate(rate_override)
        if rate <= 0:
            raise ValidationError('سعر الصرف يجب أن يكون أكبر من صفر.')
        return rate
    try:
        row = StoreCurrency.objects.get(store=store, code=code, is_active=True)
    except StoreCurrency.DoesNotExist as exc:
        raise ValidationError(f'العملة {code} غير مفعّلة في هذا المتجر.') from exc
    if row.rate_to_base <= 0:
        raise ValidationError(f'سعر صرف {code} غير صالح.')
    return quantize_rate(row.rate_to_base)


def validate_transaction_currency(store, currency_code: str) -> str:
    code = normalize_currency(currency_code)
    if not is_allowed_currency(code):
        raise ValidationError('اختر عملة من القائمة المعتمدة.')
    base = get_base_currency(store)
    if code == base:
        return code
    if not StoreCurrency.objects.filter(store=store, code=code, is_active=True).exists():
        raise ValidationError(f'العملة {code} غير مفعّلة. فعّلها من إعدادات المتجر.')
    return code


def snapshot_rate(store, currency_code, rate_override=None) -> Decimal:
    code = validate_transaction_currency(store, currency_code)
    return quantize_rate(get_rate_to_base(store, code, rate_override))


def resolve_rate_override(store, pay_currency, exchange_rate_override=None, display_exchange_rate=None):
    """Convert optional API inputs to internal rate_to_base."""
    base = get_base_currency(store)
    if display_exchange_rate is not None:
        return rate_to_base_from_display(base, pay_currency, display_exchange_rate)
    if exchange_rate_override is not None:
        return quantize_rate(exchange_rate_override)
    return None


def convert_amount(amount, from_currency, to_currency, store, rate_override=None) -> Decimal:
    """Convert monetary amount between two store currencies."""
    value = Decimal(str(amount))
    from_code = normalize_currency(from_currency)
    to_code = normalize_currency(to_currency)
    if from_code == to_code:
        return value.quantize(TWOPLACES, rounding=QUANTIZE)

    base = get_base_currency(store)
    if from_code != base:
        from_rate = get_rate_to_base(store, from_code, rate_override)
        value = value * from_rate
    if to_code == base:
        return value.quantize(TWOPLACES, rounding=QUANTIZE)

    to_rate = get_rate_to_base(store, to_code)
    return (value / to_rate).quantize(TWOPLACES, rounding=QUANTIZE)


def amount_in_base(amount, exchange_rate_to_base) -> Decimal:
    """Convert a transaction-currency amount to base using the stored snapshot rate."""
    return quantize_money(
        Decimal(str(amount)) * Decimal(str(exchange_rate_to_base))
    )


def serialize_currencies(store):
    ensure_base_currency_row(store)
    base = get_base_currency(store)
    rows = StoreCurrency.objects.filter(store=store).order_by('code')
    return {
        'base_currency': base,
        'currencies': [
            {
                'code': row.code,
                'is_active': row.is_active,
                'is_base': row.code == base,
                'rate_to_base': str(row.rate_to_base),
                'display_rate': str(display_rate_from_internal(base, row.code, row.rate_to_base)),
                'rate_quote': rate_quote_label(base, row.code),
                'updated_at': row.updated_at.isoformat() if row.updated_at else None,
            }
            for row in rows
        ],
    }
