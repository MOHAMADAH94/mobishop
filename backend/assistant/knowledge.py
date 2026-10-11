"""Official MobiShop knowledge base — editable JSON articles."""

from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

_KB_PATH = Path(__file__).resolve().parent / 'knowledge' / 'articles.json'

# Minimum score before we treat a KB hit as a confident how-to answer
MIN_CONFIDENT_SCORE = 5

# Light Arabic/English synonym boost for better matching without a vector DB
_SYNONYMS: dict[str, tuple[str, ...]] = {
    'منتج': ('منتجات', 'بضاعة', 'صنف', 'product', 'item'),
    'فاتورة': ('فواتير', 'بيع', 'invoice', 'pos'),
    'مخزون': ('كمية', 'stock', 'inventory', 'مستودع'),
    'صيانة': ('إصلاح', 'تذكرة', 'repair', 'جهاز'),
    'مورد': ('موردين', 'مشتريات', 'supplier', 'purchase'),
    'عميل': ('عملاء', 'زبون', 'customer', 'دين'),
    'معرض': ('كتالوج', 'متجر إلكتروني', 'catalog', 'shop'),
    'موظف': ('فريق', 'صلاحيات', 'employee', 'team'),
}


@lru_cache(maxsize=1)
def load_articles() -> list[dict]:
    with open(_KB_PATH, encoding='utf-8') as f:
        return json.load(f)


def reload_articles() -> list[dict]:
    load_articles.cache_clear()
    return load_articles()


def _norm(text: str) -> str:
    text = (text or '').strip().lower()
    text = text.replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ة', 'ه')
    text = re.sub(r'[^\w\s\u0600-\u06FF]', ' ', text)
    return re.sub(r'\s+', ' ', text)


def _expand_tokens(tokens: set[str]) -> set[str]:
    expanded = set(tokens)
    for token in list(tokens):
        for root, alts in _SYNONYMS.items():
            if token == root or token in alts or root in token:
                expanded.add(root)
                expanded.update(alts)
    return expanded


def search_knowledge_scored(question: str, *, limit: int = 5) -> list[tuple[int, dict]]:
    """Return (score, article) pairs sorted by score desc."""
    q = _norm(question)
    if not q:
        return []
    tokens = set(t for t in q.split() if len(t) > 1)
    tokens = _expand_tokens(tokens)
    scored: list[tuple[int, dict]] = []
    for article in load_articles():
        score = 0
        for kw in article.get('keywords') or []:
            kn = _norm(kw)
            if not kn:
                continue
            # Prefer whole-word / phrase hits to avoid «متجر» matching inside «للمتجر» alone
            word_hit = bool(re.search(rf'(?:^|\s){re.escape(kn)}(?:\s|$)', q))
            phrase_hit = len(kn.split()) > 1 and kn in q
            if phrase_hit or (word_hit and len(kn) >= 4):
                score += 6 if len(kn.split()) > 1 or len(kn) > 6 else 5
            elif word_hit:
                score += 3
            elif any(t == kn for t in tokens if len(t) > 2):
                score += 2
            elif any(len(t) > 3 and len(kn) > 3 and (t in kn or kn in t) for t in tokens):
                score += 1
        title = _norm(
            (article.get('title_ar') or '') + ' ' + (article.get('title_en') or '')
        )
        body = _norm((article.get('body_ar') or '')[:400])
        for t in tokens:
            if len(t) <= 2:
                continue
            if t in title:
                score += 2
            elif t in body:
                score += 1
        if score > 0:
            scored.append((score, article))
    scored.sort(key=lambda x: (-x[0], x[1].get('id', '')))
    return scored[:limit]


def search_knowledge(question: str, *, limit: int = 3, min_score: int = 1) -> list[dict]:
    """Keyword + synonym scoring — no vector DB required."""
    return [a for score, a in search_knowledge_scored(question, limit=limit) if score >= min_score]


def best_knowledge_score(question: str) -> int:
    scored = search_knowledge_scored(question, limit=1)
    return scored[0][0] if scored else 0


def format_knowledge_answer(articles: list[dict]) -> str | None:
    if not articles:
        return None
    parts = []
    for a in articles[:2]:
        title = a.get('title_ar') or a.get('title_en') or ''
        body = (a.get('body_ar') or '').strip()
        if not body:
            continue
        parts.append(f'**{title}**\n{body}')
    return '\n\n'.join(parts) if parts else None
