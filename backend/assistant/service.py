"""Smart assistant orchestrator — knowledge + read-only tools + LLM providers."""

from __future__ import annotations

import json
import re
from typing import Any

from assistant.analytics_service import analyze_question, build_ai_context
from assistant.intents import (
    CATEGORY_CUSTOMER_DEBTS,
    CATEGORY_HOW_TO,
    CATEGORY_GENERAL,
    CATEGORY_INVENTORY,
    CATEGORY_MAINTENANCE,
    CATEGORY_SALES_ANALYSIS,
    CATEGORY_STORE_ANALYSIS,
    CATEGORY_SUBSCRIPTION,
    CATEGORY_SUPPORT_REQUEST,
    CATEGORY_TROUBLESHOOTING,
    CATEGORY_UNKNOWN,
    detect_category,
    tools_for_category,
)
from assistant.knowledge import (
    MIN_CONFIDENT_SCORE,
    best_knowledge_score,
    format_knowledge_answer,
    search_knowledge,
)
from assistant.tools import run_tool
from decouple import config

_GREETING_RE = re.compile(
    r'^\s*(?:السلام\s*عليكم|مرحبا|مرحباً|اهلا|أهلا|هلا|كيفك|كيف\s*حالك|صباح\s*الخير|'
    r'مساء\s*الخير|hi|hello|hey|good\s*(?:morning|evening))\b',
    re.IGNORECASE,
)
_HOWTO_PROBE_RE = re.compile(
    r'(?:كيف\s+(?:أضيف|اضيف|أنشئ|انشئ|أسجل|اسجل|أستخدم|استخدم)|طريقة\s+|how\s+(?:do|to|can)\s+i)',
    re.IGNORECASE,
)
_ADVISORY_RE = re.compile(
    r'(خطة|نصيحة|اقتراح|تحليل|لماذا|ليش|كيف\s+اتعامل|كيف\s+أتعامل|استراتيجية|'
    r'أفضل\s+شيء|شو\s+أسوي|ماذا\s+أفعل|advice|plan|strategy|should\s+i)',
    re.IGNORECASE,
)


SYSTEM_PROMPT = """أنت المساعد الرسمي الذكي لمنصة موبي شوب (MobiShop).

## دورك
1) دعم تقني/منتج: شرح كيفية استخدام موبي شوب وحل المشاكل الشائعة اعتماداً على دليل المعرفة الرسمي فقط.
2) مساعد أعمال للمتجر: تحليل بيانات المتجر الحالي المصرّح بها فقط (قراءة فقط).

## قواعد صارمة
- لا تخترع ميزات أو سياسات أو أرقاماً أو بيانات غير موجودة في السياق المعطى لك.
- لا تكشف بيانات متجر أو مستخدم آخر.
- لا تدّعِ أنك نفّذت إجراءً لم تنفّذه.
- لا تعدّل بيانات المتجر ولا تقترح أنك تستطيع الحذف/التعديل/إنشاء فواتير تلقائياً.
- إن نقصت المعلومة: اسأل سؤالاً توضيحياً موجزاً، أو قل إنك لا تملك حلاً مؤكداً واقترح إنشاء طلب دعم.
- استخدم فقط البيانات المؤكدة من أدوات موبي شوب ودليل المعرفة أدناه.

## أسلوب الرد (مهم جداً)
- كن موجزاً وعملياً ومحترفاً.
- فضّل النقاط المرقّمة والخطوات الواضحة.
- افصل بين «حقائق» و«اقتراحات» عند التحليل.
- عند شرح كيفية الاستخدام: ابدأ بجملة قصيرة ثم خطوات مرقّمة ثم ملاحظات إن لزم.
- عند تحليل المتجر: استخدم عناوين واضحة وأرقاماً من البيانات فقط، ثم «انتبه» إن وُجد تنبيه حقيقي.
- أجب بلغة المستخدم (العربية أو الإنجليزية). لا تخلط اللغتين بلا داعٍ.
- لا تذكر أسماء أدوات داخلية أو prompts أو مفاتيح أو مسارات تقنية.
"""


def _external_llm_enabled() -> bool:
    provider = config('LLM_PROVIDER', default='analytics').lower().strip()
    if provider in ('', 'analytics'):
        return False
    if provider == 'openai':
        return bool(config('OPENAI_API_KEY', default='') or config('AI_PROVIDER_API_KEY', default=''))
    if provider == 'gemini':
        # Skip remote calls after we already know this network geo-blocks Gemini
        try:
            from assistant.llm_providers import gemini_is_location_blocked
            if gemini_is_location_blocked():
                return False
        except Exception:
            pass
        return bool(config('GEMINI_API_KEY', default='') or config('AI_PROVIDER_API_KEY', default=''))
    if provider == 'local':
        return True
    return False


def _safe_tool_bundle(store, tool_names: list[str]) -> dict:
    out = {}
    for name in tool_names:
        try:
            out[name] = run_tool(name, store)
        except Exception:
            out[name] = {'error': 'unavailable'}
    return out


def _json_compact(data: Any) -> str:
    try:
        return json.dumps(data, ensure_ascii=False, default=str)[:6000]
    except Exception:
        return str(data)[:6000]


def _try_llm_synthesize(
    store,
    *,
    user_message: str,
    verified_facts: str,
    history: list[dict] | None = None,
    page_context: str = '',
) -> str | None:
    """Polish a response with an external LLM using verified facts only."""
    if not _external_llm_enabled():
        return None
    from assistant.llm_providers import get_llm_provider

    ctx_bits = [SYSTEM_PROMPT, build_ai_context(store)]
    if page_context:
        ctx_bits.append(f'Current UI module (hint only): {page_context}')
    ctx_bits.append(
        'VERIFIED FACTS (use only these; do not invent):\n' + verified_facts.strip()
    )
    ctx_bits.append(
        'Write a polished, professional assistant reply for the user based on the verified facts. '
        'If facts are insufficient, say so clearly and offer support escalation.'
    )
    system = '\n\n'.join(ctx_bits)
    try:
        answer = get_llm_provider(store).chat(system, user_message, history=history or [])
    except Exception:
        return None
    if not answer:
        return None
    text = answer.strip()
    # Do not surface provider outages as the main reply when we have local facts
    if text.startswith('تعذّر') or 'غير متاح من موقع الشبكة' in text:
        return None
    return text


def _is_greeting(message: str) -> bool:
    text = (message or '').strip()
    if not text or len(text) > 60:
        return False
    return bool(_GREETING_RE.search(text))


def _greeting_reply() -> str:
    return (
        'أهلاً بك 👋 أنا بخير، شكراً لسؤالك.\n\n'
        'أنا مساعد موبي شوب الذكي — أقدر أساعدك في:\n'
        '• شرح استخدام موبي شوب خطوة بخطوة\n'
        '• ملخص متجرك والمبيعات والمخزون\n'
        '• الديون والصيانة والتنبيهات المهمة\n\n'
        'جرّب مثلاً: «ملخص متجري» أو «كيف أضيف منتج؟»'
    )


def _is_generic_analytics(result: dict) -> bool:
    answer = result.get('answer') or ''
    rec = result.get('recommendation') or ''
    blob = f'{answer}\n{rec}'
    return 'جرّب أحد الأسئلة المقترحة' in blob


def _compose_open_local_answer(store, message: str, *, page_context: str = '') -> dict:
    """Smarter local reply for unusual/open questions when external LLM is unavailable."""
    tools_used = [
        'get_store_summary',
        'get_top_selling_products',
        'get_customer_debts',
        'get_inventory_summary',
    ]
    bundle = _safe_tool_bundle(store, tools_used)
    summary = bundle.get('get_store_summary') if isinstance(bundle.get('get_store_summary'), dict) else {}
    top = bundle.get('get_top_selling_products') if isinstance(bundle.get('get_top_selling_products'), list) else []
    debts = bundle.get('get_customer_debts') if isinstance(bundle.get('get_customer_debts'), dict) else {}
    inv = bundle.get('get_inventory_summary') if isinstance(bundle.get('get_inventory_summary'), dict) else {}

    # Strong KB only
    articles = search_knowledge(message, min_score=MIN_CONFIDENT_SCORE)
    kb = format_knowledge_answer(articles)

    lower = (message or '').lower()
    parts: list[str] = []

    if kb:
        parts.append('من دليل موبي شوب:')
        parts.append(kb)
    else:
        parts.append(
            'سؤالك خارج الأسئلة الجاهزة — سأجيب باحتراف اعتماداً على ما هو متاح فعلياً في موبي شوب '
            'وبيانات متجرك (بدون اختراع ميزات).'
        )

    # Grounded store snapshot for advisory / open business questions
    if summary and not summary.get('error') and (
        _ADVISORY_RE.search(message or '') or not kb
    ):
        parts.append('')
        parts.append('📊 وضع متجرك الآن (حقائق):')
        parts.append(
            f"• إيراد اليوم: {summary.get('today_revenue')} {summary.get('currency')} "
            f"| فواتير: {summary.get('today_invoices')}"
        )
        parts.append(
            f"• إيراد الشهر: {summary.get('month_revenue')} | صافي ربح الشهر: {summary.get('month_net_profit')}"
        )
        parts.append(
            f"• مخزون منخفض: {summary.get('low_stock_count')} | ديون العملاء: {summary.get('customer_debt_total')} "
            f"| صيانة مفتوحة: {summary.get('open_repairs')}"
        )
        if top:
            names = ', '.join(
                (p.get('name') or p.get('product_name') or str(p))[:40]
                for p in top[:3]
            )
            parts.append(f'• من الأكثر مبيعاً هذا الشهر: {names}')
        if inv and not inv.get('error'):
            parts.append(
                f"• المخزون: نشط {inv.get('active_products')} | نافد {inv.get('out_of_stock')} | منخفض {inv.get('low_stock')}"
            )

    # Practical suggestions tied to real MobiShop capabilities
    suggestions: list[str] = []
    if any(w in lower for w in ('دين', 'دفع', 'مماط', 'يتأخر', 'debt')):
        suggestions.append(
            'للعملاء المتأخرين: راجع «العملاء» → الدين والمراجع، سجّل دفعات جزئية، '
            'وتجنّب بيعاً بجزئي جديد لنفس العميل حتى ينخفض الدين.'
        )
        if debts and debts.get('customers'):
            top_debtor = debts['customers'][0]
            suggestions.append(
                f"أعلى دين حالياً: {top_debtor.get('name')} ({top_debtor.get('debt')} {debts.get('currency')})."
            )
    if any(w in lower for w in ('صرف', 'exchange', 'دولار', 'عملة')):
        suggestions.append(
            'تحديث سعر الصرف يتم يدوياً من إعدادات العملات — لا يوجد ربط يومي تلقائي بمصدر خارجي حالياً.'
        )
    if any(w in lower for w in ('خطة', 'أسبوع', 'تشغيل', 'plan', 'week')):
        suggestions.append(
            'خطة أسبوع عملية: 1) صفّر تنبيهات المخزون المنخفض 2) حصّل أعلى الديون '
            '3) راجع الصيانة المتأخرة 4) ركّز ترويجاً على الأكثر مبيعاً 5) راجع صندوق العملات يومياً.'
        )
    if any(w in lower for w in ('اكسسوار', 'إكسسوار', 'جوال', 'لماذا', 'ليش')):
        suggestions.append(
            'لفهم لماذا فئة تبيع أكثر: قارن «أفضل المبيعات» وكميات المخزون وهوامش الربح من مركز الأعمال/المساعد — '
            'قد يكون السبب التوفر أو السعر أو الطلب المحلي.'
        )
    if not suggestions and not kb:
        suggestions.append(
            'إن كان سؤالك عن ميزة غير موجودة في موبي شوب سأقول ذلك صراحة. '
            'يمكنك أيضاً إنشاء طلب دعم لفريق موبي شوب.'
        )

    if suggestions:
        parts.append('')
        parts.append('💡 اقتراحات عملية (ليست تعديلاً تلقائياً على بياناتك):')
        parts.extend(f'• {s}' for s in suggestions)

    if page_context:
        parts.append('')
        parts.append(f'السياق: أنت في قسم «{page_context}».')

    return _result(
        '\n'.join(parts),
        statistics={'knowledge_ids': [a['id'] for a in articles], 'open_tools': bundle},
        recommendation='للحصول على ردود أذكى لصياغة حرة، فعّل Gemini من سيرفر بمنطقة مدعومة.',
        category=CATEGORY_GENERAL,
        can_escalate=True,
        tools_used=tools_used,
    )


def _attention_lines(summary: dict) -> list[str]:
    lines = []
    low = int(summary.get('low_stock_count') or 0)
    debts = summary.get('customer_debt_total')
    open_repairs = int(summary.get('open_repairs') or 0)
    today_inv = int(summary.get('today_invoices') or 0)
    if low > 0:
        lines.append(f'لديك {low} منتجاً بمخزون منخفض — راجع إعادة الطلب.')
    if debts not in (None, '', 0, '0', '0.00') and str(debts) not in ('0', '0.0', '0.00'):
        lines.append(f'ديون العملاء المستحقة: {debts} {summary.get("currency", "")}'.strip())
    if open_repairs > 0:
        lines.append(f'{open_repairs} تذكرة صيانة مفتوحة تحتاج متابعة.')
    if today_inv == 0:
        lines.append('لا توجد فواتير اليوم بعد — راقب نشاط نقطة البيع.')
    return lines


def _format_store_summary_ar(data: dict) -> str:
    parts = [
        f"📊 ملخص متجر {data.get('store_name', '')}",
        '',
        'الحقائق:',
        f"• مبيعات اليوم: {data.get('today_revenue')} {data.get('currency')}",
        f"• صافي ربح اليوم: {data.get('today_net_profit')} {data.get('currency')}",
        f"• فواتير اليوم: {data.get('today_invoices')}",
        f"• إيراد الشهر: {data.get('month_revenue')} {data.get('currency')}",
        f"• صافي ربح الشهر: {data.get('month_net_profit')} {data.get('currency')}",
        f"• مخزون منخفض: {data.get('low_stock_count')} منتج",
        f"• ديون العملاء: {data.get('customer_debt_total')} {data.get('currency')}",
        f"• صيانة مفتوحة: {data.get('open_repairs')}",
    ]
    attention = _attention_lines(data)
    if attention:
        parts.append('')
        parts.append('⚠️ انتبه:')
        parts.extend(f'• {line}' for line in attention)
    return '\n'.join(parts)


def _format_debts_ar(data: dict) -> str:
    if not data.get('customers'):
        return (
            '👥 ديون العملاء\n\n'
            'لا توجد ديون مستحقة حالياً.\n'
            'اقتراح: راجع فواتير الدفع الجزئي وتذاكر الصيانة عند التسليم.'
        )
    lines = [f"• {c['name']}: {c['debt']} {data['currency']}" for c in data['customers'][:8]]
    return (
        f"👥 ديون العملاء\n\n"
        f"الإجمالي المستحق: {data['total']} {data['currency']}\n\n"
        "أبرز العملاء:\n" + '\n'.join(lines) +
        '\n\nاقتراح: سجّل الدفعات من بطاقة العميل أو الفاتورة/التذكرة.'
    )


def _format_inventory_ar(inv: dict, low: list) -> str:
    lines = [
        '📦 حالة المخزون',
        '',
        'الحقائق:',
        f"• منتجات نشطة: {inv.get('active_products')}",
        f"• متوفر: {inv.get('in_stock')} | نافد: {inv.get('out_of_stock')} | منخفض: {inv.get('low_stock')}",
    ]
    if low:
        lines.append('')
        lines.append('يحتاج إعادة طلب:')
        for p in low[:8]:
            lines.append(f"• {p.get('name')} — الكمية {p.get('quantity')} (حد التنبيه {p.get('low_stock_threshold', '—')})")
        lines.append('')
        lines.append('اقتراح: ركّز أولاً على المنتجات سريعة الحركة ذات المخزون المنخفض.')
    else:
        lines.append('')
        lines.append('لا توجد منتجات تحت حد التنبيه حالياً.')
    return '\n'.join(lines)


def _format_maintenance_ar(data: dict) -> str:
    lines = [
        '🔧 الصيانة',
        '',
        f"• تذاكر مفتوحة: {data.get('open_count')}",
        f"• متأخرة: {data.get('late_count')}",
        f"• حسب الحالة: {data.get('by_status')}",
    ]
    late = int(data.get('late_count') or 0)
    if late > 0:
        lines.append('')
        lines.append(f'⚠️ انتبه: {late} تذكرة متأخرة — راجع أولوية التسليم والتواصل مع العملاء.')
    return '\n'.join(lines)


def _wrap_howto(kb_answer: str, *, page_context: str = '') -> str:
    parts = [
        'إليك الخطوات المعتمدة في موبي شوب:',
        '',
        kb_answer.strip(),
    ]
    if page_context:
        parts.append('')
        parts.append(f'ملاحظة: أنت حالياً في قسم «{page_context}» — اتبع الخطوات ضمن نفس القسم إن انطبق.')
    parts.append('')
    parts.append('إن لم يحل ذلك مشكلتك، يمكنني مساعدتك بإنشاء طلب دعم لفريق موبي شوب.')
    return '\n'.join(parts)


def _result(
    answer: str,
    *,
    statistics: dict | None = None,
    recommendation: str | None = None,
    category: str,
    can_escalate: bool = False,
    tools_used: list | None = None,
) -> dict:
    return {
        'answer': answer,
        'statistics': statistics or {},
        'recommendation': recommendation,
        'category': category,
        'can_escalate': can_escalate,
        'tools_used': tools_used or [],
    }


def process_assistant_message(
    store,
    message: str,
    *,
    page_context: str = '',
    user=None,
    history: list[dict] | None = None,
) -> dict:
    """
    Returns dict: answer, statistics, recommendation, category, can_escalate, tools_used
    """
    category = detect_category(message)
    tools_used: list[str] = []
    statistics: dict = {}
    history = history or []

    # Cross-store / unauthorized probes — refuse without leaking
    lower = message.lower()
    if any(x in lower for x in ('متجر آخر', 'store b', 'another store', 'كل المتاجر', 'all stores')):
        if 'متجري' not in message and 'my store' not in lower:
            return _result(
                'لا يمكنني عرض بيانات متجر آخر. أعمل فقط ضمن متجرك الحالي المصرّح به.\n'
                'إن كنت تحتاج مساعدة إدارية بين متاجر متعددة، تواصل مع دعم موبي شوب.',
                category=category,
                can_escalate=True,
            )

    # Short greetings / small talk — never dump analytics
    if _is_greeting(message):
        polished = _try_llm_synthesize(
            store,
            user_message=message,
            verified_facts=(
                'User sent a greeting/small-talk message. '
                'Reply warmly in the user language as MobiShop Smart Assistant. '
                'Offer 2-3 example questions (store summary, inventory, how to add product). '
                'Do not invent store numbers.'
            ),
            history=history,
            page_context=page_context,
        )
        return _result(
            polished or _greeting_reply(),
            category=CATEGORY_GENERAL,
            can_escalate=False,
        )

    # Knowledge / how-to — only when match is confident (avoid wrong article on open questions)
    if category in (
        CATEGORY_HOW_TO, CATEGORY_TROUBLESHOOTING, CATEGORY_SUBSCRIPTION, CATEGORY_GENERAL,
    ) or (category == CATEGORY_UNKNOWN and _HOWTO_PROBE_RE.search(message or '')):
        if best_knowledge_score(message) >= MIN_CONFIDENT_SCORE:
            articles = search_knowledge(message, min_score=MIN_CONFIDENT_SCORE)
            kb_answer = format_knowledge_answer(articles)
            if kb_answer:
                polished = _try_llm_synthesize(
                    store,
                    user_message=message,
                    verified_facts=kb_answer,
                    history=history,
                    page_context=page_context,
                )
                answer = polished or _wrap_howto(kb_answer, page_context=page_context)
                return _result(
                    answer,
                    statistics={'knowledge_ids': [a['id'] for a in articles]},
                    recommendation='إن لم يحل ذلك مشكلتك، يمكنني مساعدتك بإنشاء طلب دعم.',
                    category=category if category != CATEGORY_UNKNOWN else CATEGORY_HOW_TO,
                    can_escalate=True,
                )

    if category == CATEGORY_SUPPORT_REQUEST:
        return _result(
            'يمكنني تسجيل طلب دعم لفريق موبي شوب.\n\n'
            'اكتب وصفاً موجزاً للمشكلة (ماذا حدث؟ في أي شاشة؟)، ثم اضغط «إنشاء طلب دعم».\n'
            'سأرفق مع الطلب سياق المتجر والقسم الحالي إن توفر.',
            category=CATEGORY_SUPPORT_REQUEST,
            can_escalate=True,
        )

    # Structured store tools for analysis intents
    tool_names = tools_for_category(category)
    if tool_names:
        tools_used = tool_names
        bundle = _safe_tool_bundle(store, tool_names)
        statistics = bundle

        template = None
        recommendation = None
        if category == CATEGORY_STORE_ANALYSIS and 'get_store_summary' in bundle:
            data = bundle['get_store_summary']
            if isinstance(data, dict) and 'error' not in data:
                template = _format_store_summary_ar(data)
                low = data.get('low_stock_count') or 0
                if low:
                    recommendation = f'انتبه: لديك {low} منتجاً بمخزون منخفض.'
        elif category == CATEGORY_CUSTOMER_DEBTS and 'get_customer_debts' in bundle:
            data = bundle['get_customer_debts']
            if isinstance(data, dict) and 'error' not in data:
                template = _format_debts_ar(data)
                recommendation = 'سجّل الدفعات من لوحة العميل أو الفاتورة/التذكرة.'
        elif category == CATEGORY_INVENTORY:
            inv = bundle.get('get_inventory_summary') or {}
            low = bundle.get('get_low_stock_products') or []
            if isinstance(inv, dict) and 'error' not in inv:
                template = _format_inventory_ar(inv, low if isinstance(low, list) else [])
        elif category == CATEGORY_MAINTENANCE and 'get_maintenance_summary' in bundle:
            data = bundle['get_maintenance_summary']
            if isinstance(data, dict) and 'error' not in data:
                template = _format_maintenance_ar(data)
        elif category == CATEGORY_SALES_ANALYSIS:
            result = analyze_question(store, message)
            template = result.get('answer')
            recommendation = result.get('recommendation')
            statistics = {**(result.get('statistics') or {}), **bundle}

        if template:
            polished = _try_llm_synthesize(
                store,
                user_message=message,
                verified_facts=_json_compact(bundle) + '\n\nDraft:\n' + template,
                history=history,
                page_context=page_context,
            )
            return _result(
                polished or template,
                statistics=statistics,
                recommendation=recommendation,
                category=category,
                tools_used=tools_used,
            )

    # Enrich open questions with store tools for LLM / local advisory
    open_tools = tools_used or [
        'get_store_summary', 'get_top_selling_products', 'get_customer_debts', 'get_inventory_summary',
    ]
    open_bundle = _safe_tool_bundle(store, open_tools)
    articles = search_knowledge(message, min_score=MIN_CONFIDENT_SCORE)
    kb = format_knowledge_answer(articles)

    # Prefer external LLM for open/unusual questions
    if _external_llm_enabled():
        from assistant.llm_providers import get_llm_provider

        kb_snip = f'\nKnowledge:\n{kb}' if kb else '\nKnowledge: (no confident article match)'
        page_snip = f'\nUI module: {page_context}' if page_context else ''
        system = (
            SYSTEM_PROMPT
            + '\n'
            + build_ai_context(store)
            + page_snip
            + '\nTool data:\n'
            + _json_compact(open_bundle)
            + kb_snip
            + '\nIf the user asks for a feature that is not in Knowledge/Tool data, say it is not available in MobiShop yet.'
        )
        try:
            answer = get_llm_provider(store).chat(system, message, history=history)
        except Exception:
            answer = None
        if answer and not str(answer).startswith('تعذّر') and 'غير متاح من موقع الشبكة' not in str(answer):
            return _result(
                answer,
                statistics={**(statistics or {}), 'open_tools': open_bundle},
                category=category if category != CATEGORY_UNKNOWN else CATEGORY_GENERAL,
                can_escalate=True,
                tools_used=open_tools,
            )

    # Local analytics patterns (real store Q&A) — only when intent matched something useful
    result = analyze_question(store, message)
    if not _is_generic_analytics(result):
        return _result(
            result.get('answer') or '',
            statistics=result.get('statistics') or {},
            recommendation=result.get('recommendation'),
            category=category,
            can_escalate=category in (CATEGORY_UNKNOWN, CATEGORY_TROUBLESHOOTING),
            tools_used=tools_used,
        )

    # Unusual / open questions without Gemini: composed advisory (not wrong KB dump)
    return _compose_open_local_answer(store, message, page_context=page_context)
