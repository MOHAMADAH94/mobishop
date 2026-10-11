import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Card, CardHeader, CardTitle } from '../ui/Card'
import { useToastStore } from '../../stores/toastStore'
import { useStoreVersion } from '../../hooks/useCurrentStore'
import {
  CURRENCY_OPTIONS,
  currencyLabel,
  displayRateFromInternal,
  normalizeCurrency,
  rateQuoteLabel,
} from '../../lib/currencies'
import type { StoreCurrenciesResponse, StoreCurrencyRow } from '../../types'

interface RowState extends StoreCurrencyRow {
  display_rate: string
}

function toRowState(base: string, row: StoreCurrencyRow): RowState {
  const display =
    row.display_rate ??
    String(displayRateFromInternal(base, row.code, parseFloat(row.rate_to_base) || 1))
  return { ...row, display_rate: display }
}

export function StoreCurrenciesPanel() {
  const toast = useToastStore((s) => s.add)
  const storeVersion = useStoreVersion()
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [rows, setRows] = useState<RowState[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newRate, setNewRate] = useState('')

  useEffect(() => {
    setLoading(true)
    api
      .get<StoreCurrenciesResponse>('/stores/currencies/')
      .then(({ data }) => {
        setBaseCurrency(data.base_currency)
        setRows(data.currencies.map((r) => toRowState(data.base_currency, r)))
      })
      .catch((err) => toast(getErrorMessage(err), 'error'))
      .finally(() => setLoading(false))
  }, [storeVersion, toast])

  const availableToAdd = CURRENCY_OPTIONS.filter(
    (c) => !rows.some((r) => r.code === c.code),
  )

  const addCurrency = () => {
    const code = normalizeCurrency(newCode)
    if (!code) {
      toast('اختر عملة', 'error')
      return
    }
    const rate = parseFloat(newRate)
    if (!rate || rate <= 0) {
      toast('أدخل سعر صرف صحيح', 'error')
      return
    }
    if (rows.some((r) => r.code === code)) {
      toast('العملة مضافة مسبقاً', 'error')
      return
    }
    setRows((prev) => [
      ...prev,
      {
        code,
        is_active: true,
        is_base: false,
        rate_to_base: '1',
        display_rate: String(rate),
        rate_quote: rateQuoteLabel(baseCurrency, code),
        updated_at: null,
      },
    ])
    setNewCode('')
    setNewRate('')
  }

  const updateRow = (code: string, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, ...patch } : r)))
  }

  const removeRow = (code: string) => {
    if (code === baseCurrency) {
      toast('لا يمكن حذف العملة الأساسية', 'error')
      return
    }
    setRows((prev) => prev.filter((r) => r.code !== code))
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        currencies: rows.map((r) => ({
          code: r.code,
          is_active: r.is_active,
          display_rate: r.is_base ? '1' : r.display_rate,
        })),
      }
      const { data } = await api.put<StoreCurrenciesResponse>('/stores/currencies/', payload)
      setBaseCurrency(data.base_currency)
      setRows(data.currencies.map((r) => toRowState(data.base_currency, r)))
      toast('تم حفظ العملات وأسعار الصرف', 'success')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>العملات وأسعار الصرف</CardTitle></CardHeader>
        <p className="text-sm text-[var(--text-muted)]">جاري التحميل...</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle>العملات وأسعار الصرف</CardTitle></CardHeader>
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        العملة الأساسية: <strong>{currencyLabel(baseCurrency)}</strong>. لكل عملة يظهر
        سعر الصرف بالصيغة المناسبة — مثلاً مع أساس USD: «1 USD = 46 TRY»، ومع أساس SYP:
        «1 USD = 15000 SYP».
      </p>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.code}
            className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border)] p-3"
          >
            <div className="min-w-[120px] flex-1">
              <p className="text-xs text-[var(--text-muted)]">العملة</p>
              <p className="font-medium">{currencyLabel(row.code)}</p>
              {row.is_base && (
                <span className="text-xs text-[var(--primary)]">أساسية</span>
              )}
            </div>
            <div className="w-48">
              <Input
                label={row.is_base ? 'الأساس' : (row.rate_quote || rateQuoteLabel(baseCurrency, row.code))}
                type="number"
                step="0.000001"
                min="0"
                value={row.is_base ? '1' : row.display_rate}
                onChange={(e) => updateRow(row.code, { display_rate: e.target.value })}
                disabled={row.is_base}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={row.is_active}
                disabled={row.is_base}
                onChange={(e) => updateRow(row.code, { is_active: e.target.checked })}
              />
              مفعّلة
            </label>
            {!row.is_base && (
              <button
                type="button"
                onClick={() => removeRow(row.code)}
                className="pb-2 text-[var(--danger)]"
                aria-label="حذف"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {availableToAdd.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl bg-[var(--bg-muted)] p-3">
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-sm text-[var(--text-muted)]">إضافة عملة</label>
            <select
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
            >
              <option value="">— اختر —</option>
              {availableToAdd.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <Input
              label={newCode ? rateQuoteLabel(baseCurrency, newCode) : 'سعر الصرف'}
              type="number"
              step="0.000001"
              min="0"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              placeholder={baseCurrency === 'USD' ? '46' : '15000'}
            />
          </div>
          <Button type="button" variant="secondary" onClick={addCurrency}>
            <Plus className="h-4 w-4" />
            إضافة
          </Button>
        </div>
      )}

      <Button type="button" className="mt-4" loading={saving} onClick={save}>
        حفظ العملات
      </Button>
    </Card>
  )
}
