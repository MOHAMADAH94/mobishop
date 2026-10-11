"""Helpers for integer vs fractional product quantities."""
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation


MAX_PRECISION = 3
QTY_QUANT = Decimal('0.001')


def to_qty(value) -> Decimal:
    try:
        qty = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('كمية غير صالحة.') from exc
    return qty


def normalize_product_qty(product, value) -> Decimal:
    """Validate and quantize quantity according to product fractional settings."""
    qty = to_qty(value)
    if qty <= 0:
        raise ValueError('الكمية يجب أن تكون أكبر من صفر.')

    allow = bool(getattr(product, 'allow_fractional_quantity', False))
    precision = int(getattr(product, 'quantity_precision', 0) or 0)
    precision = max(0, min(MAX_PRECISION, precision))

    if not allow:
        if qty != qty.to_integral_value():
            raise ValueError(
                f'المنتج «{product.name}» لا يقبل كميات كسرية. فعّل الخيار من بطاقة المنتج.'
            )
        return qty.quantize(Decimal('1'))

    step = Decimal('1') if precision == 0 else Decimal('0.1') ** precision
    quantized = qty.quantize(step, rounding=ROUND_HALF_UP)
    if quantized <= 0:
        raise ValueError('الكمية يجب أن تكون أكبر من صفر.')
    return quantized.quantize(QTY_QUANT)


def clamp_stock(value) -> Decimal:
    qty = to_qty(value)
    return max(Decimal('0'), qty.quantize(QTY_QUANT))
