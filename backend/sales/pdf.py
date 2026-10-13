import io
import os
from functools import lru_cache

from django.http import HttpResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ألوان التطبيق (موبي شوب — brand blue)
COLOR_PRIMARY = colors.HexColor('#2563eb')
COLOR_PRIMARY_DARK = colors.HexColor('#1e40af')
COLOR_PRIMARY_SOFT = colors.HexColor('#dbeafe')
COLOR_ACCENT = colors.HexColor('#3b82f6')
COLOR_TEXT = colors.HexColor('#0f172a')
COLOR_MUTED = colors.HexColor('#64748b')
COLOR_BORDER = colors.HexColor('#e2e8f0')
COLOR_ROW_ALT = colors.HexColor('#f8fafc')
COLOR_BG_SOFT = colors.HexColor('#eff6ff')
COLOR_WHITE = colors.white
COLOR_SUCCESS = colors.HexColor('#059669')
COLOR_DANGER = colors.HexColor('#dc2626')

_FONT = 'Helvetica'
_BOLD = 'Helvetica-Bold'
_READY = False
_FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fonts')
_ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')
_LOGO_PATH = os.path.join(_ASSETS_DIR, 'mobishop-logo.png')


def _register_fonts():
    global _FONT, _BOLD, _READY
    if _READY:
        return

    candidates = [
        (os.path.join(_FONTS_DIR, 'NotoSansArabic-Regular.ttf'), 'ArRegular'),
        (os.path.join(_FONTS_DIR, 'NotoSansArabic-Bold.ttf'), 'ArBold'),
        (os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arial.ttf'), 'ArRegular'),
        (os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'arialbd.ttf'), 'ArBold'),
        (os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'tahoma.ttf'), 'ArRegular'),
        (os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', 'tahomabd.ttf'), 'ArBold'),
        ('/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf', 'ArRegular'),
        ('/usr/share/fonts/google-noto/NotoSansArabic-Regular.ttf', 'ArRegular'),
    ]

    registered = set()
    for path, name in candidates:
        if name in registered or not os.path.exists(path):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            registered.add(name)
        except Exception:
            pass

    if 'ArRegular' in pdfmetrics.getRegisteredFontNames():
        _FONT = 'ArRegular'
        _BOLD = 'ArBold' if 'ArBold' in pdfmetrics.getRegisteredFontNames() else 'ArRegular'
    _READY = True


def _xml_escape(text):
    return (
        str(text)
        .replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )


def _reshape(text):
    if not text:
        return ''
    s = str(text)
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        return get_display(arabic_reshaper.reshape(s))
    except ImportError:
        return s


def _p(text, style):
    """Plain text → reshape + XML escape for ReportLab Paragraph."""
    return Paragraph(_xml_escape(_reshape(text)), style)


def _product_label_paragraph(product_name, style, *, imei='', sku=''):
    """Reshape/escape product name only; keep HTML tags for IMEI/SKU intact."""
    name_html = _xml_escape(_reshape(product_name or ''))
    if imei:
        meta = _xml_escape(f'IMEI: {imei}')
        markup = f'{name_html}<br/><font size="7" color="#64748b">{meta}</font>'
    elif sku:
        meta = _xml_escape(f'SKU: {sku}')
        markup = f'{name_html}<br/><font size="7" color="#64748b">{meta}</font>'
    else:
        markup = name_html
    return Paragraph(markup, style)


def _money(amount, currency='USD'):
    """تنسيق مبلغ: منزلتان على الأقل، وحتى 4 عند الحاجة (أسعار البيع)."""
    sym = '$' if currency == 'USD' else currency
    try:
        from decimal import Decimal, ROUND_HALF_UP

        q = Decimal(str(amount)).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)
        sign = '-' if q < 0 else ''
        q = abs(q)
        text = format(q, 'f')
        whole, _, frac = text.partition('.')
        frac = (frac or '').rstrip('0')
        if len(frac) < 2:
            frac = frac.ljust(2, '0')
        return f'{sym} {sign}{int(whole):,}.{frac}'
    except Exception:
        return f'{sym} {float(amount):,.2f}'


@lru_cache(maxsize=4)
def _watermark_reader(path: str, opacity: float = 0.10):
    """شعار شفاف للاستخدام كخلفية (watermark)."""
    if not path or not os.path.exists(path):
        return None
    try:
        from PIL import Image as PILImage

        img = PILImage.open(path).convert('RGBA')
        alpha = img.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        img.putalpha(alpha)
        buf = io.BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        return ImageReader(buf)
    except Exception:
        try:
            return ImageReader(path)
        except Exception:
            return None


def _resolve_logo_path(store=None):
    """شعار المتجر إن وُجد، وإلا شعار موبي شوب."""
    if store is not None:
        logo = getattr(store, 'logo', None)
        if logo:
            try:
                path = logo.path
                if path and os.path.exists(path):
                    return path
            except Exception:
                pass
    if os.path.exists(_LOGO_PATH):
        return _LOGO_PATH
    # fallback: frontend public during local dev
    root = os.path.abspath(os.path.join(_ASSETS_DIR, '..', '..', '..'))
    alt = os.path.join(root, 'frontend', 'public', 'favicon.png')
    return alt if os.path.exists(alt) else None


def _draw_page_chrome(canvas, doc, store_name=''):
    """خلفية شفافة + شريط علوي/سفلي بألوان العلامة."""
    canvas.saveState()
    page_w, page_h = A4

    # شريط علوي متدرج اللون (شريطين متراكبين ليعطي إحساس التدرّج)
    canvas.setFillColor(COLOR_PRIMARY_DARK)
    canvas.rect(0, page_h - 8 * mm, page_w, 8 * mm, fill=1, stroke=0)
    canvas.setFillColor(COLOR_PRIMARY)
    canvas.rect(0, page_h - 5.5 * mm, page_w, 5.5 * mm, fill=1, stroke=0)

    # watermark — شعار موبي شوب شفاف في وسط الصفحة
    wm = _watermark_reader(_LOGO_PATH if os.path.exists(_LOGO_PATH) else '', 0.09)
    if wm is None and os.path.exists(_LOGO_PATH):
        wm = _watermark_reader(_LOGO_PATH, 0.09)
    if wm is not None:
        size = 95 * mm
        x = (page_w - size) / 2
        y = (page_h - size) / 2 - 5 * mm
        try:
            canvas.drawImage(wm, x, y, width=size, height=size, mask='auto', preserveAspectRatio=True)
        except Exception:
            pass

    # شريط سفلي
    canvas.setFillColor(COLOR_PRIMARY)
    canvas.rect(0, 0, page_w, 10 * mm, fill=1, stroke=0)
    canvas.setFillColor(COLOR_WHITE)
    canvas.setFont(_FONT if _FONT != 'Helvetica' else 'Helvetica', 8)
    footer = _reshape('موبي شوب  ·  MobiShop')
    canvas.drawCentredString(page_w / 2, 3.8 * mm, footer)

    canvas.restoreState()


def _styles():
    return {
        'store': ParagraphStyle(
            'InvStore', fontName=_BOLD, fontSize=16, textColor=COLOR_PRIMARY_DARK,
            alignment=TA_RIGHT, leading=22,
        ),
        'badge': ParagraphStyle(
            'InvBadge', fontName=_BOLD, fontSize=11, textColor=COLOR_WHITE,
            alignment=TA_CENTER, leading=14,
        ),
        'label': ParagraphStyle(
            'InvLabel', fontName=_FONT, fontSize=8, textColor=COLOR_MUTED,
            alignment=TA_RIGHT, leading=11,
        ),
        'value': ParagraphStyle(
            'InvValue', fontName=_BOLD, fontSize=10, textColor=COLOR_TEXT,
            alignment=TA_RIGHT, leading=13,
        ),
        'meta': ParagraphStyle(
            'InvMeta', fontName=_FONT, fontSize=9, textColor=COLOR_TEXT,
            alignment=TA_RIGHT, leading=13,
        ),
        'cell': ParagraphStyle(
            'InvCell', fontName=_FONT, fontSize=9, textColor=COLOR_TEXT,
            alignment=TA_CENTER, leading=12,
        ),
        'cell_name': ParagraphStyle(
            'InvCellName', fontName=_FONT, fontSize=9, textColor=COLOR_TEXT,
            alignment=TA_RIGHT, leading=12,
        ),
        'cell_hdr': ParagraphStyle(
            'InvCellH', fontName=_BOLD, fontSize=9, textColor=COLOR_WHITE,
            alignment=TA_CENTER, leading=12,
        ),
        'total_label': ParagraphStyle(
            'InvTotL', fontName=_FONT, fontSize=9, textColor=COLOR_MUTED,
            alignment=TA_RIGHT, leading=12,
        ),
        'total_val': ParagraphStyle(
            'InvTotV', fontName=_BOLD, fontSize=9, textColor=COLOR_TEXT,
            alignment=TA_LEFT, leading=12,
        ),
        'grand_label': ParagraphStyle(
            'InvGrandL', fontName=_BOLD, fontSize=11, textColor=COLOR_WHITE,
            alignment=TA_RIGHT, leading=14,
        ),
        'grand_val': ParagraphStyle(
            'InvGrandV', fontName=_BOLD, fontSize=11, textColor=COLOR_WHITE,
            alignment=TA_LEFT, leading=14,
        ),
        'footer': ParagraphStyle(
            'InvFooter', fontName=_FONT, fontSize=8, textColor=COLOR_MUTED,
            alignment=TA_CENTER, leading=11,
        ),
        'section': ParagraphStyle(
            'InvSec', fontName=_BOLD, fontSize=10, textColor=COLOR_PRIMARY,
            alignment=TA_RIGHT, leading=13,
        ),
    }


def generate_invoice_pdf(sale):
    _register_fonts()
    buffer = io.BytesIO()
    store = sale.store
    currency = sale.currency or store.currency or 'USD'
    styles = _styles()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )

    method_labels = {
        'cash': 'نقدي',
        'electronic': 'إلكتروني',
        'partial': 'جزئي',
        'card': 'إلكتروني',
    }
    method = method_labels.get(sale.payment_method, sale.payment_method)
    due = max(sale.total - sale.total_returned - sale.amount_paid, 0)

    elements = []

    # —— رأس الفاتورة: شعار + اسم المتجر + شارة ——
    logo_path = _resolve_logo_path(store)
    logo_cell = ''
    if logo_path and os.path.exists(logo_path):
        try:
            from reportlab.platypus import Image as RLImage
            logo_cell = RLImage(logo_path, width=16 * mm, height=16 * mm, kind='proportional')
        except Exception:
            logo_cell = ''

    title_block = [
        _p(store.name, styles['store']),
        Spacer(1, 2),
        _p('فاتورة مبيعات', styles['section']),
    ]
    if store.phone:
        title_block.append(_p(store.phone, styles['label']))
    if store.address:
        title_block.append(_p(store.address[:80], styles['label']))

    badge_data = [[_p('فاتورة', styles['badge'])]]
    badge = Table(badge_data, colWidths=[28 * mm])
    badge.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_PRIMARY),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))

    header_row = [[logo_cell, title_block, badge]]
    header_table = Table(header_row, colWidths=[20 * mm, 110 * mm, 32 * mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('ALIGN', (2, 0), (2, 0), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 4))
    elements.append(HRFlowable(width='100%', thickness=2, color=COLOR_PRIMARY, spaceBefore=2, spaceAfter=8))

    # —— بطاقة معلومات الفاتورة ——
    info_left = [
        [_p('رقم الفاتورة', styles['label']), _p(sale.invoice_number, styles['value'])],
        [_p('التاريخ', styles['label']), _p(sale.created_at.strftime('%Y-%m-%d  %H:%M'), styles['value'])],
        [_p('العملة', styles['label']), _p(currency, styles['value'])],
        [_p('طريقة الدفع', styles['label']), _p(method, styles['value'])],
    ]
    if sale.created_by_id:
        cashier = ''
        try:
            u = sale.created_by
            cashier = (u.get_full_name() or u.username) if u else ''
        except Exception:
            cashier = ''
        if cashier:
            info_left.append([_p('الكاشير', styles['label']), _p(cashier, styles['value'])])

    info_right = []
    if sale.customer:
        info_right = [
            [_p('العميل', styles['label']), _p(sale.customer.name, styles['value'])],
            [_p('الهاتف', styles['label']), _p(sale.customer.phone or '—', styles['value'])],
        ]
    else:
        info_right = [
            [_p('العميل', styles['label']), _p('زائر / نقدي', styles['value'])],
        ]

    left_tbl = Table(info_left, colWidths=[28 * mm, 48 * mm])
    left_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SOFT),
        ('BOX', (0, 0), (-1, -1), 0.6, COLOR_PRIMARY_SOFT),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))

    right_tbl = Table(info_right, colWidths=[22 * mm, 54 * mm])
    right_tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_ROW_ALT),
        ('BOX', (0, 0), (-1, -1), 0.6, COLOR_BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))

    meta_row = Table([[right_tbl, left_tbl]], colWidths=[82 * mm, 80 * mm])
    meta_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(meta_row)
    elements.append(Spacer(1, 12))

    # —— جدول المنتجات ——
    elements.append(_p('تفاصيل المنتجات', styles['section']))
    elements.append(Spacer(1, 4))

    header = [
        _p('#', styles['cell_hdr']),
        _p('المنتج', styles['cell_hdr']),
        _p('الكمية', styles['cell_hdr']),
        _p('السعر', styles['cell_hdr']),
        _p('الإجمالي', styles['cell_hdr']),
    ]
    data = [header]
    items = list(sale.items.all())
    for idx, item in enumerate(items, start=1):
        data.append([
            _p(str(idx), styles['cell']),
            _product_label_paragraph(
                item.product_name,
                styles['cell_name'],
                imei=item.imei or '',
                sku=item.sku or '',
            ),
            _p(str(item.quantity), styles['cell']),
            _p(_money(item.unit_price, currency), styles['cell']),
            _p(_money(item.line_total, currency), styles['cell']),
        ])

    items_table = Table(data, colWidths=[10 * mm, 78 * mm, 18 * mm, 28 * mm, 28 * mm])
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), COLOR_PRIMARY),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLOR_WHITE),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('BOX', (0, 0), (-1, -1), 0.7, COLOR_PRIMARY),
        ('LINEBELOW', (0, 0), (-1, 0), 0, COLOR_PRIMARY),
        ('LINEBELOW', (0, 1), (-1, -1), 0.4, COLOR_BORDER),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), COLOR_ROW_ALT))
        else:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), COLOR_WHITE))
    items_table.setStyle(TableStyle(style_cmds))
    elements.append(items_table)
    elements.append(Spacer(1, 10))

    # —— ملخص المبالغ ——
    summary_rows = [
        ('المجموع الفرعي', sale.subtotal, False),
        ('الخصم', sale.discount, False),
        ('الضريبة', sale.tax_amount, False),
    ]
    if sale.total_returned > 0:
        summary_rows.append(('المرتجعات', -sale.total_returned, False))
        summary_rows.append(('الصافي', sale.net_total, True))
    else:
        summary_rows.append(('الإجمالي', sale.total, True))
    summary_rows.append(('المدفوع', sale.amount_paid, False))
    if due > 0:
        summary_rows.append(('المتبقي', due, False))

    tot_data = []
    for label, val, is_grand in summary_rows:
        if is_grand:
            tot_data.append([
                _p(_money(abs(val), currency), styles['grand_val']),
                _p(label, styles['grand_label']),
            ])
        else:
            tot_data.append([
                _p(_money(abs(val), currency), styles['total_val']),
                _p(label, styles['total_label']),
            ])

    tot_table = Table(tot_data, colWidths=[40 * mm, 40 * mm])
    tot_cmds = [
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('BOX', (0, 0), (-1, -1), 0.8, COLOR_PRIMARY_SOFT),
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_SOFT),
        ('LINEBELOW', (0, 0), (-1, -2), 0.3, COLOR_BORDER),
    ]
    for i, (label, _, is_grand) in enumerate(summary_rows):
        if is_grand:
            tot_cmds.append(('BACKGROUND', (0, i), (-1, i), COLOR_PRIMARY))
            tot_cmds.append(('TOPPADDING', (0, i), (-1, i), 8))
            tot_cmds.append(('BOTTOMPADDING', (0, i), (-1, i), 8))
        elif label == 'المتبقي' and due > 0:
            tot_cmds.append(('TEXTCOLOR', (0, i), (0, i), COLOR_DANGER))
        elif label == 'المدفوع':
            tot_cmds.append(('TEXTCOLOR', (0, i), (0, i), COLOR_SUCCESS))
    tot_table.setStyle(TableStyle(tot_cmds))

    totals_wrap = Table([['', tot_table]], colWidths=[82 * mm, 80 * mm])
    totals_wrap.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(KeepTogether([totals_wrap]))

    # —— تذييل مخصص للمتجر ——
    footer_text = ''
    try:
        if hasattr(store, 'settings') and store.settings and store.settings.invoice_footer:
            footer_text = store.settings.invoice_footer.strip()
    except Exception:
        pass

    elements.append(Spacer(1, 16))
    elements.append(HRFlowable(width='100%', thickness=0.6, color=COLOR_BORDER, spaceBefore=2, spaceAfter=8))
    if footer_text:
        elements.append(_p(footer_text, styles['footer']))
        elements.append(Spacer(1, 4))
    elements.append(_p('شكراً لتعاملكم معنا', styles['footer']))

    def _on_page(canvas, doc_):
        _draw_page_chrome(canvas, doc_, store.name)

    doc.build(elements, onFirstPage=_on_page, onLaterPages=_on_page)
    buffer.seek(0)
    return buffer


def pdf_http_response(sale):
    buffer = generate_invoice_pdf(sale)
    response = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{sale.invoice_number}.pdf"'
    response['Content-Length'] = len(response.content)
    return response
