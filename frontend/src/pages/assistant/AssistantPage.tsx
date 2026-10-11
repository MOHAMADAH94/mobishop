import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Bot, LifeBuoy, Send, Sparkles, User } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { ASSISTANT_SUGGESTED_QUESTIONS } from '../../lib/assistantConstants'
import {
  DECISION_CENTER_QUESTIONS,
  DECISION_QUESTION_CATEGORIES,
} from '../../lib/decisionCenterConstants'
import { hasPermission } from '../../lib/permissions'
import { useToastStore } from '../../stores/toastStore'
import type {
  AssistantQuickAction,
  AssistantSuggestedResponse,
  ChatResponse,
} from '../../types'

interface LocalMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  recommendation?: string | null
  canEscalate?: boolean
  category?: string
}

const DEFAULT_WELCOME =
  'مرحباً 👋\nأنا مساعد موبي شوب الذكي.\nيمكنني مساعدتك في استخدام موبي شوب، حل المشاكل، وتحليل بيانات متجرك.'

const DEFAULT_QUICK_ACTIONS: AssistantQuickAction[] = [
  { id: 'store_summary', label: '📊 ملخص متجري', message: 'ما هو ملخص متجري اليوم؟' },
  { id: 'inventory', label: '📦 المخزون', message: 'ما حالة المخزون والمنتجات المنخفضة؟' },
  { id: 'sales', label: '💰 المبيعات', message: 'ما أكثر المنتجات مبيعاً هذا الشهر؟' },
  { id: 'debts', label: '👥 ديون العملاء', message: 'ما العملاء الذين لديهم ديون مستحقة؟' },
  { id: 'repairs', label: '🔧 الصيانة', message: 'ما أوامر الصيانة المتأخرة؟' },
  { id: 'howto', label: '❓ كيف أستخدم موبي شوب؟', message: 'كيف أستخدم موبي شوب؟' },
  { id: 'problem', label: '🛠️ لدي مشكلة', message: 'لدي مشكلة وأحتاج دعم' },
]

function moduleFromPath(pathname: string): string {
  const segment = pathname.split('/').filter(Boolean)[0] || 'dashboard'
  const map: Record<string, string> = {
    dashboard: 'لوحة التحكم',
    products: 'المنتجات',
    inventory: 'المخزون',
    pos: 'نقطة البيع',
    sales: 'الفواتير',
    customers: 'العملاء',
    repairs: 'الصيانة',
    expenses: 'المصاريف',
    suppliers: 'الموردون',
    purchases: 'المشتريات',
    'purchase-intake': 'إدخال مشتريات',
    catalog: 'معرض المتجر',
    'store-app': 'تطبيق المتجر',
    'smart-business': 'مركز الأعمال الذكي',
    team: 'الفريق',
    settings: 'الإعدادات',
    cashbox: 'صندوق العملات',
  }
  return map[segment] || segment
}

export function AssistantPage() {
  const store = useCurrentStore()
  const storeVersion = useStoreVersion()
  const location = useLocation()
  const toast = useToastStore((s) => s.add)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [welcome, setWelcome] = useState(DEFAULT_WELCOME)
  const [quickActions, setQuickActions] = useState<AssistantQuickAction[]>(DEFAULT_QUICK_ACTIONS)
  const [suggested, setSuggested] = useState<string[]>(ASSISTANT_SUGGESTED_QUESTIONS)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const pendingQuestion = searchParams.get('q')
  const pageContext = moduleFromPath(location.pathname)

  const featureEnabled = store?.ai_assistant_enabled !== false
  const allowed = featureEnabled && hasPermission(store?.role, 'ai_assistant')

  useEffect(() => {
    setMessages([])
    setSessionId(null)
  }, [storeVersion])

  useEffect(() => {
    if (!allowed) return
    api
      .get<AssistantSuggestedResponse>('/assistant/suggested-questions/')
      .then(({ data }) => {
        if (data.welcome) setWelcome(data.welcome)
        if (data.quick_actions?.length) setQuickActions(data.quick_actions)
        if (data.questions?.length) setSuggested(data.questions)
      })
      .catch(() => {
        /* keep defaults */
      })
  }, [allowed, storeVersion])

  useEffect(() => {
    if (messages.length === 0) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sending])

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || sending || !allowed) return
      const userMsg: LocalMessage = { id: `u-${Date.now()}`, role: 'user', content: text.trim() }
      setMessages((prev) => [...prev, userMsg])
      setInput('')
      setSending(true)

      api
        .post<ChatResponse>('/assistant/chat/', {
          message: text.trim(),
          session_id: sessionId,
          page_context: pageContext,
        })
        .then(({ data }) => {
          if (data.session_id) setSessionId(data.session_id)
          setMessages((prev) => [
            ...prev,
            {
              id: `a-${data.message_id}`,
              role: 'assistant',
              content: data.answer,
              recommendation: data.recommendation,
              canEscalate: Boolean(data.can_escalate),
              category: data.category,
            },
          ])
        })
        .catch((err) => toast(getErrorMessage(err), 'error'))
        .finally(() => setSending(false))
    },
    [sessionId, sending, toast, pageContext, allowed],
  )

  useEffect(() => {
    if (!pendingQuestion || sending || messages.length > 0 || !allowed) return
    sendMessage(pendingQuestion)
    setSearchParams({}, { replace: true })
  }, [pendingQuestion, sending, messages.length, sendMessage, setSearchParams, allowed])

  const createSupportRequest = async (msg: LocalMessage) => {
    if (escalating || !allowed) return
    setEscalating(true)
    try {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      const convo = messages
        .slice(-12)
        .map((m) => `${m.role === 'user' ? 'المستخدم' : 'المساعد'}: ${m.content.slice(0, 500)}`)
        .join('\n')
      await api.post('/assistant/support-requests/', {
        issue: lastUser?.content || msg.content.slice(0, 1000),
        subject: `طلب دعم — ${pageContext || 'المساعد الذكي'}`,
        session_id: sessionId,
        category: msg.category || '',
        page_context: pageContext,
        conversation_summary: convo,
      })
      toast('تم إنشاء طلب الدعم بنجاح', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setEscalating(false)
    }
  }

  const questionMeta = Object.fromEntries(DECISION_CENTER_QUESTIONS.map((q) => [q.text, q.category]))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(input)
  }

  if (!allowed) {
    return (
      <Card className="p-8 text-center">
        <Bot className="mx-auto mb-3 h-12 w-12 text-[var(--text-muted)] opacity-50" />
        <p className="font-medium">مساعد موبي شوب الذكي غير متاح</p>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          {!featureEnabled
            ? 'الميزة غير مفعّلة لهذا المتجر. تواصل مع دعم موبي شوب.'
            : 'لا تملك صلاحية الوصول للمساعد الذكي.'}
        </p>
      </Card>
    )
  }

  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col gap-4 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-72">
        <Card className="flex max-h-[calc(100vh-14rem)] flex-col p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-[var(--primary)]" />
            إجراءات سريعة
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickActions.map((qa) => (
              <button
                key={qa.id}
                type="button"
                onClick={() => sendMessage(qa.message)}
                disabled={sending}
                className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs transition-colors hover:border-[var(--primary)]/40 hover:bg-[var(--primary)]/5 disabled:opacity-50"
              >
                {qa.label}
              </button>
            ))}
          </div>
          <h3 className="mt-4 text-sm font-semibold">أسئلة مقترحة</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{suggested.length} سؤالاً جاهزاً</p>
          <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
            {suggested.map((q) => {
              const category = questionMeta[q]
              const catStyle = category ? DECISION_QUESTION_CATEGORIES[category] : null
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={sending}
                  className="flex w-full flex-col gap-1 rounded-lg border border-transparent bg-[var(--bg-muted)] px-3 py-2 text-right text-sm transition-colors hover:border-[var(--primary)]/30 hover:bg-[var(--primary)]/5 disabled:opacity-50"
                >
                  {catStyle && (
                    <span className={`self-start rounded-md px-1.5 py-0.5 text-[10px] font-medium ${catStyle.color}`}>
                      {catStyle.label}
                    </span>
                  )}
                  {q}
                </button>
              )
            })}
          </div>
        </Card>
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bot className="mb-4 h-14 w-14 text-[var(--primary)] opacity-60" />
                <p className="max-w-md whitespace-pre-wrap text-sm leading-relaxed text-[var(--text)]">
                  {welcome}
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'user' ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg-muted)]'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-[var(--primary)] text-white'
                      : 'bg-[var(--bg-muted)]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content.replace(/\*\*/g, '')}</p>
                  {msg.recommendation && !msg.content.includes(msg.recommendation) && (
                    <div className="mt-2 flex gap-2 rounded-xl border border-blue-200/70 bg-gradient-to-l from-blue-50/90 to-[var(--bg-card)] p-2.5 dark:border-blue-900/40 dark:from-blue-950/40">
                      <span className="text-base leading-none">💡</span>
                      <p className="text-xs leading-relaxed text-blue-900 dark:text-blue-200">
                        {msg.recommendation}
                      </p>
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.canEscalate && (
                    <button
                      type="button"
                      disabled={escalating}
                      onClick={() => createSupportRequest(msg)}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--bg-muted)] disabled:opacity-50"
                    >
                      <LifeBuoy className="h-3.5 w-3.5" />
                      إنشاء طلب دعم
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bg-muted)]">
                  <Bot className="h-4 w-4 animate-pulse" />
                </div>
                <div className="rounded-2xl bg-[var(--bg-muted)] px-4 py-3 text-sm text-[var(--text-muted)]">
                  جاري التحليل...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اكتب سؤالك هنا..."
                disabled={sending}
                maxLength={2000}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-sm outline-none focus:border-[var(--primary)]"
              />
              <Button type="submit" disabled={sending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
