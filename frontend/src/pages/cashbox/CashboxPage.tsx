import { useEffect, useState } from 'react'
import { Banknote, RefreshCw } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card, CardHeader, CardTitle } from '../../components/ui/Card'
import { Modal } from '../../components/ui/Modal'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { formatMoney } from '../../lib/utils'
import type { CashboxPaymentMethodRow } from '../../types'

interface CashboxCurrency {
  code: string
  is_base: boolean
  opening: string
  cash_in: string
  cash_out: string
  balance: string
  breakdown: {
    cash_sales: string
    cash_sale_payments: string
    repair_cash: string
    expenses: string
    purchases: string
  }
}

interface CashboxResponse {
  base_currency: string
  currencies: CashboxCurrency[]
  payment_methods?: CashboxPaymentMethodRow[]
}

export function CashboxPage() {
  const store = useCurrentStore()
  const toast = useToastStore((s) => s.add)
  const [data, setData] = useState<CashboxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<CashboxCurrency | null>(null)
  const [opening, setOpening] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data: res } = await api.get<CashboxResponse>('/stores/cashbox/')
      setData(res)
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [store?.id])

  const saveOpening = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const { data: res } = await api.post<CashboxResponse>('/stores/cashbox/', {
        code: editing.code,
        opening,
      })
      setData(res)
      setEditing(null)
      toast('تم تحديث الرصيد الافتتاحي', 'success')
    } catch (e) {
      toast(getErrorMessage(e), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">صندوق العملات</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            الرصيد النقدي لكل عملة يتعامل بها المحل (وارد نقدي − صادر نقدي + افتتاحي)
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
      </div>

      {loading && !data ? (
        <p className="py-12 text-center text-[var(--text-muted)]">جاري التحميل...</p>
      ) : !data?.currencies?.length ? (
        <EmptyState
          icon={Banknote}
          title="لا توجد عملات مفعّلة"
          description="أضف عملات المتجر من الإعدادات أولاً"
        />
      ) : (
        <>
          {data.payment_methods && data.payment_methods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>تفصيل طرق الدفع (المبيعات)</CardTitle>
              </CardHeader>
              <ul className="space-y-2 text-sm">
                {data.payment_methods.map((row) => (
                  <li
                    key={row.method}
                    className="flex items-center justify-between gap-3 border-b border-[var(--border)]/50 py-2 last:border-0"
                  >
                    <span className="text-[var(--text-muted)]">{row.label || row.method}</span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(row.total, data.base_currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.currencies.map((c) => (
              <Card key={c.code}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="flex items-center gap-2">
                      <Banknote className="h-5 w-5 text-[var(--primary)]" />
                      {c.code}
                      {c.is_base && (
                        <span className="text-xs font-normal text-[var(--text-muted)]">(أساسية)</span>
                      )}
                    </CardTitle>
                  </div>
                </CardHeader>
                <p className="text-3xl font-bold text-[var(--primary)]">
                  {formatMoney(c.balance, c.code)}
                </p>
                <div className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">افتتاحي</span>
                    <span>{formatMoney(c.opening, c.code)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--success)]">
                    <span>وارد نقدي</span>
                    <span>+{formatMoney(c.cash_in, c.code)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--danger)]">
                    <span>صادر نقدي</span>
                    <span>−{formatMoney(c.cash_out, c.code)}</span>
                  </div>
                </div>
                <details className="mt-3 text-xs text-[var(--text-muted)]">
                  <summary className="cursor-pointer">التفصيل</summary>
                  <ul className="mt-2 space-y-1 pr-2">
                    <li className="flex justify-between"><span>مبيعات نقدية</span><span>{c.breakdown.cash_sales}</span></li>
                    <li className="flex justify-between"><span>دفعات فواتير</span><span>{c.breakdown.cash_sale_payments}</span></li>
                    <li className="flex justify-between"><span>صيانة نقدي</span><span>{c.breakdown.repair_cash}</span></li>
                    <li className="flex justify-between"><span>مصاريف</span><span>{c.breakdown.expenses}</span></li>
                    <li className="flex justify-between"><span>مشتريات</span><span>{c.breakdown.purchases}</span></li>
                  </ul>
                </details>
                {store?.role?.code === 'owner' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={() => {
                      setEditing(c)
                      setOpening(c.opening)
                    }}
                  >
                    تعديل الرصيد الافتتاحي
                  </Button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`رصيد افتتاحي — ${editing?.code || ''}`}>
        <div className="space-y-4">
          <Input
            label="الرصيد الافتتاحي"
            type="number"
            step="0.01"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
          <Button onClick={saveOpening} loading={saving} className="w-full">
            حفظ
          </Button>
        </div>
      </Modal>
    </div>
  )
}
