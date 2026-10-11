import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot, LifeBuoy, RotateCcw, Send, User } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { useToastStore } from '../../stores/toastStore'
import { cn } from '../../lib/utils'
import type { AssistantQuickAction, ChatResponse } from '../../types'

const QUICK: AssistantQuickAction[] = [
  { id: 'store_summary', label: '📊 ملخص متجري', message: 'ما هو ملخص متجري اليوم؟' },
  { id: 'inventory', label: '📦 المخزون', message: 'ما حالة المخزون والمنتجات المنخفضة؟' },
  { id: 'sales', label: '💰 المبيعات', message: 'ما أكثر المنتجات مبيعاً هذا الشهر؟' },
  { id: 'debts', label: '👥 ديون العملاء', message: 'ما العملاء الذين لديهم ديون مستحقة؟' },
  { id: 'repairs', label: '🔧 الصيانة', message: 'ما أوامر الصيانة المتأخرة؟' },
  { id: 'howto', label: '❓ كيف أستخدم موبي شوب؟', message: 'كيف أستخدم موبي شوب؟' },
  { id: 'problem', label: '🛠️ لدي مشكلة', message: 'لدي مشكلة وأحتاج دعم' },
]

const MODULE_LABELS: Record<string, string> = {
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

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  recommendation?: string | null
  canEscalate?: boolean
  category?: string
}

const WELCOME: Msg = {
  id: 'welcome',
  role: 'assistant',
  content:
    'مرحباً 👋\nأنا مساعد موبي شوب الذكي.\n\nيمكنني مساعدتك في استخدام موبي شوب، حل المشاكل، وتحليل بيانات متجرك.',
}

function formatAssistantText(text: string): ReactNode {
  const lines = text.replace(/\*\*/g, '').split('\n')
  return lines.map((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return <br key={i} />
    if (trimmed.startsWith('• ') || trimmed.startsWith('- ')) {
      return (
        <span key={i} className="mt-0.5 flex gap-1.5">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-current opacity-50" />
          <span>{trimmed.slice(2)}</span>
        </span>
      )
    }
    return (
      <span key={i} className="block">
        {line}
      </span>
    )
  })
}

function TypingDots() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--primary)]/10 text-[var(--primary)] ring-1 ring-[var(--primary)]/15">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tr-md bg-[var(--bg-muted)] px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]/70"
            style={{
              animation: 'assistant-dot 1.1s ease-in-out infinite',
              animationDelay: `${i * 0.16}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}

export function AssistantMiniPanel({ onClose }: { onClose?: () => void }) {
  const location = useLocation()
  const toast = useToastStore((s) => s.add)
  const [messages, setMessages] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const segment = location.pathname.split('/').filter(Boolean)[0] || 'dashboard'
  const pageContext = MODULE_LABELS[segment] || segment

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, sending])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 140)
    return () => window.clearTimeout(t)
  }, [])

  const resetChat = () => {
    setMessages([WELCOME])
    setSessionId(null)
    setInput('')
    inputRef.current?.focus()
  }

  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || sending) return
      const trimmed = text.trim().slice(0, 2000)
      setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: trimmed }])
      setInput('')
      setSending(true)
      api
        .post<ChatResponse>('/assistant/chat/', {
          message: trimmed,
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
        .catch((err) => {
          toast(getErrorMessage(err), 'error')
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'assistant',
              content:
                'تعذّر الوصول للمعلومات حالياً. حاول مرة أخرى أو أنشئ طلب دعم لفريق موبي شوب.',
              canEscalate: true,
            },
          ])
        })
        .finally(() => setSending(false))
    },
    [sessionId, sending, toast, pageContext],
  )

  const createSupportRequest = async (msg: Msg) => {
    if (escalating) return
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
      setMessages((prev) => [
        ...prev,
        {
          id: `ok-${Date.now()}`,
          role: 'assistant',
          content: '✅ تم إرسال طلب الدعم. سيتابعه فريق موبي شوب في أقرب وقت.',
        },
      ])
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setEscalating(false)
    }
  }

  const showQuick = messages.length <= 1

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)]/80 bg-[var(--bg)]/40 px-3 py-2">
        <p className="truncate text-[11px] text-[var(--text-muted)]">
          أنت في: <span className="font-semibold text-[var(--text)]">{pageContext}</span>
        </p>
        <button
          type="button"
          onClick={resetChat}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--bg-muted)] hover:text-[var(--text)]"
          title="محادثة جديدة"
        >
          <RotateCcw className="h-3 w-3" />
          محادثة جديدة
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-3 py-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn('flex gap-2', msg.role === 'user' ? 'flex-row-reverse' : '')}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                msg.role === 'user'
                  ? 'bg-[var(--primary)] text-white shadow-sm'
                  : 'bg-[var(--primary)]/10 text-[var(--primary)] ring-1 ring-[var(--primary)]/15',
              )}
            >
              {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div
              className={cn(
                'max-w-[84%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm',
                msg.role === 'user'
                  ? 'rounded-tl-md bg-gradient-to-br from-[var(--primary)] to-[#1e40af] text-white'
                  : 'rounded-tr-md border border-[var(--border)]/60 bg-[var(--bg-muted)] text-[var(--text)]',
              )}
            >
              <div className="whitespace-pre-wrap">{formatAssistantText(msg.content)}</div>
              {msg.recommendation && !msg.content.includes(msg.recommendation) && (
                <p
                  className={cn(
                    'mt-2 border-t pt-2 text-[11px] leading-relaxed',
                    msg.role === 'user' ? 'border-white/25 text-white/90' : 'border-[var(--border)] text-[var(--text-muted)]',
                  )}
                >
                  💡 {msg.recommendation}
                </p>
              )}
              {msg.role === 'assistant' && msg.canEscalate && (
                <button
                  type="button"
                  disabled={escalating}
                  onClick={() => createSupportRequest(msg)}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-[var(--primary)]/25 bg-[var(--bg-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--primary)] transition hover:bg-[var(--primary)]/5 disabled:opacity-50"
                >
                  <LifeBuoy className="h-3.5 w-3.5" />
                  إنشاء طلب دعم
                </button>
              )}
            </div>
          </div>
        ))}
        {sending && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {showQuick && (
        <div className="shrink-0 border-t border-[var(--border)] px-3 py-2.5">
          <p className="mb-2 text-[11px] font-semibold text-[var(--text-muted)]">ابدأ بسؤال سريع</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <button
                key={q.id}
                type="button"
                disabled={sending}
                onClick={() => sendMessage(q.message)}
                className="rounded-full border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text)] transition hover:border-[var(--primary)]/45 hover:bg-[var(--primary)]/8 hover:text-[var(--primary)] disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] p-3"
        onSubmit={(e) => {
          e.preventDefault()
          sendMessage(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-1.5 shadow-inner focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--primary)]/15">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            disabled={sending}
            maxLength={2000}
            placeholder="اسأل عن متجرك أو طريقة الاستخدام..."
            className="max-h-28 min-h-[42px] flex-1 resize-none bg-transparent px-2.5 py-2.5 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[#1e40af] text-white shadow-md transition hover:brightness-110 disabled:opacity-40"
            aria-label="إرسال"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-[var(--text-muted)]">
          Enter للإرسال · Shift+Enter لسطر جديد · Esc للإغلاق
          {onClose ? '' : ''}
        </p>
      </form>
    </div>
  )
}
