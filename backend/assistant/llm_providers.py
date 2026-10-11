"""طبقة تجريد لمزودي LLM — OpenAI / Gemini / Local."""

from abc import ABC, abstractmethod
from decouple import config


_SAFE_FAIL = 'تعذّر الاتصال بمزوّد الذكاء الاصطناعي حالياً. حاول لاحقاً أو أنشئ طلب دعم.'
_LOCATION_FAIL = (
    'مزوّد Gemini غير متاح من موقع الشبكة الحالية.\n'
    'يعمل المساعد الآن بالوضع المحلي (بيانات متجرك + دليل موبي شوب).\n'
    'لتفعيل Gemini بالكامل: شغّل الـ Backend من سيرفر في منطقة مدعومة، أو استخدم VPN أثناء التطوير.'
)

# Cache geo-block for this process so open questions don't wait on repeated API calls
_gemini_location_blocked = False


def gemini_is_location_blocked() -> bool:
    return _gemini_location_blocked


class BaseLLMProvider(ABC):
    @abstractmethod
    def chat(self, system_prompt: str, user_message: str, history: list | None = None) -> str:
        pass


class AnalyticsLLMProvider(BaseLLMProvider):
    """مزود افتراضي — يستخدم التحليل الداخلي بدون API خارجي."""

    def __init__(self, store):
        self.store = store

    def chat(self, system_prompt: str, user_message: str, history: list | None = None) -> str:
        from assistant.analytics_service import analyze_question
        result = analyze_question(self.store, user_message)
        parts = [result['answer']]
        if result.get('recommendation'):
            parts.append(f"\n💡 **توصية:** {result['recommendation']}")
        return '\n'.join(parts)


class OpenAIProvider(BaseLLMProvider):
    def chat(self, system_prompt: str, user_message: str, history: list | None = None) -> str:
        try:
            import urllib.request
            import json
            api_key = config('OPENAI_API_KEY', default='') or config('AI_PROVIDER_API_KEY', default='')
            if not api_key:
                raise ValueError('missing_api_key')
            model = config('OPENAI_MODEL', default='gpt-4o-mini')
            max_tokens = int(config('OPENAI_MAX_TOKENS', default='900'))
            temperature = float(config('OPENAI_TEMPERATURE', default='0.35'))
            messages = [{'role': 'system', 'content': system_prompt}]
            for msg in (history or [])[-8:]:
                role = msg.get('role')
                content = (msg.get('content') or '')[:1500]
                if role in ('user', 'assistant') and content:
                    messages.append({'role': role, 'content': content})
            messages.append({'role': 'user', 'content': user_message})
            payload = json.dumps({
                'model': model,
                'messages': messages,
                'temperature': temperature,
                'max_tokens': max_tokens,
            }).encode()
            req = urllib.request.Request(
                'https://api.openai.com/v1/chat/completions',
                data=payload,
                headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read())
            return data['choices'][0]['message']['content']
        except Exception:
            return _SAFE_FAIL


class GeminiProvider(BaseLLMProvider):
    def chat(self, system_prompt: str, user_message: str, history: list | None = None) -> str:
        global _gemini_location_blocked
        if _gemini_location_blocked:
            return _LOCATION_FAIL
        try:
            import urllib.error
            import urllib.request
            import json
            api_key = (
                config('GEMINI_API_KEY', default='') or config('AI_PROVIDER_API_KEY', default='')
            ).strip().strip('"').strip("'")
            if not api_key:
                raise ValueError('missing_api_key')
            preferred = config('GEMINI_MODEL', default='gemini-3.8-flash').strip()
            models = [preferred]
            for fallback in ('gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'):
                if fallback not in models:
                    models.append(fallback)

            contents = []
            for msg in (history or [])[-8:]:
                role = 'user' if msg.get('role') == 'user' else 'model'
                content = (msg.get('content') or '')[:1500]
                if content:
                    contents.append({'role': role, 'parts': [{'text': content}]})
            contents.append({'role': 'user', 'parts': [{'text': user_message}]})
            payload = json.dumps({
                'systemInstruction': {'parts': [{'text': system_prompt}]},
                'contents': contents,
                'generationConfig': {
                    'temperature': float(config('GEMINI_TEMPERATURE', default='0.35')),
                    'maxOutputTokens': int(config('GEMINI_MAX_TOKENS', default='1200')),
                },
            }).encode()

            last_err = None
            location_blocked = False
            for model in models:
                url = (
                    f'https://generativelanguage.googleapis.com/v1beta/models/'
                    f'{model}:generateContent?key={api_key}'
                )
                req = urllib.request.Request(
                    url, data=payload, headers={'Content-Type': 'application/json'}, method='POST',
                )
                try:
                    with urllib.request.urlopen(req, timeout=12) as resp:
                        data = json.loads(resp.read())
                    return data['candidates'][0]['content']['parts'][0]['text']
                except urllib.error.HTTPError as exc:
                    last_err = exc
                    err_body = ''
                    try:
                        err_body = exc.read().decode('utf-8', errors='replace')
                    except Exception:
                        err_body = ''
                    if 'location is not supported' in err_body.lower() or 'FAILED_PRECONDITION' in err_body:
                        location_blocked = True
                        break
                    # Retry next model on not found / bad model id
                    if exc.code in (404, 400):
                        continue
                    break
            if location_blocked:
                _gemini_location_blocked = True
                return _LOCATION_FAIL
            if last_err:
                raise last_err
            raise RuntimeError('gemini_failed')
        except Exception:
            return _SAFE_FAIL


class LocalLLMProvider(BaseLLMProvider):
    def chat(self, system_prompt: str, user_message: str, history: list | None = None) -> str:
        try:
            import urllib.request
            import json
            base_url = config('LOCAL_LLM_URL', default='http://localhost:11434')
            model = config('LOCAL_LLM_MODEL', default='llama3')
            messages = [{'role': 'system', 'content': system_prompt}]
            for msg in (history or [])[-8:]:
                role = msg.get('role')
                content = (msg.get('content') or '')[:1500]
                if role in ('user', 'assistant') and content:
                    messages.append({'role': role, 'content': content})
            messages.append({'role': 'user', 'content': user_message})
            payload = json.dumps({
                'model': model,
                'messages': messages,
                'stream': False,
                'options': {'temperature': 0.35},
            }).encode()
            req = urllib.request.Request(
                f'{base_url.rstrip("/")}/api/chat',
                data=payload,
                headers={'Content-Type': 'application/json'},
                method='POST',
            )
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read())
            return data.get('message', {}).get('content', str(data))
        except Exception:
            return _SAFE_FAIL


def get_llm_provider(store) -> BaseLLMProvider:
    provider = config('LLM_PROVIDER', default='analytics').lower()
    if provider == 'openai':
        return OpenAIProvider()
    if provider == 'gemini':
        return GeminiProvider()
    if provider == 'local':
        return LocalLLMProvider()
    return AnalyticsLLMProvider(store)
