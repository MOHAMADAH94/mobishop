import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import JsBarcode from 'jsbarcode'
import { Printer, ArrowRight } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { formatMoney } from '../../lib/utils'
import { extractList } from '../../lib/apiHelpers'
import type { Paginated, Product } from '../../types'

interface LabelRow {
  product: Product
  count: number
}

function BarcodeSvg({ value, className }: { value: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!ref.current || !value) return
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 1.6,
        height: 40,
        background: '#ffffff',
        lineColor: '#000000',
      })
    } catch {
      /* invalid barcode value */
    }
  }, [value])

  if (!value) {
    return <span className="text-xs text-red-600">لا يوجد باركود</span>
  }

  return <svg ref={ref} className={className} />
}

export function BarcodePrintPage() {
  const [searchParams] = useSearchParams()
  const store = useCurrentStore()
  const currency = store?.currency
  const toast = useToastStore((s) => s.add)
  const [loading, setLoading] = useState(true)
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [rows, setRows] = useState<LabelRow[]>([])
  const [pickerId, setPickerId] = useState('')

  const idsFromQuery = useMemo(() => {
    const raw = searchParams.get('ids') || ''
    return raw
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n > 0)
  }, [searchParams])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const collected: Product[] = []
        let page = 1
        let hasNext = true
        while (hasNext && page <= 20) {
          const { data } = await api.get<Paginated<Product>>('/products/', {
            params: { page: String(page), is_active: 'true', page_size: '100' },
          })
          const batch = data.results || []
          collected.push(...batch)
          hasNext = Boolean(data.next)
          page += 1
          if (!data.next && batch.length === 0 && page === 2) {
            // non-paginated fallback
            const list = extractList(data as unknown as Product[] | { results: Product[] })
            if (list.length) collected.push(...list)
            break
          }
        }
        setAllProducts(collected)
        if (idsFromQuery.length) {
          const selected = collected.filter((p) => idsFromQuery.includes(p.id))
          setRows(selected.map((product) => ({ product, count: 1 })))
        }
      } catch (e) {
        toast(getErrorMessage(e), 'error')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [idsFromQuery, toast])

  const labels = useMemo(() => {
    const out: Product[] = []
    for (const row of rows) {
      const n = Math.max(0, Math.min(99, row.count || 0))
      for (let i = 0; i < n; i++) out.push(row.product)
    }
    return out
  }, [rows])

  const addProduct = () => {
    const id = parseInt(pickerId, 10)
    if (!id) return
    const product = allProducts.find((p) => p.id === id)
    if (!product) return
    setRows((prev) => {
      if (prev.some((r) => r.product.id === id)) return prev
      return [...prev, { product, count: 1 }]
    })
    setPickerId('')
  }

  const setCount = (id: number, raw: string) => {
    const n = parseInt(raw, 10)
    setRows((prev) =>
      prev.map((r) =>
        r.product.id === id
          ? { ...r, count: Number.isNaN(n) ? 1 : Math.max(1, Math.min(99, n)) }
          : r,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          header, aside, nav, [data-assistant-fab], .no-print { display: none !important; }
          main { padding: 0 !important; margin: 0 !important; }
          body { background: white !important; color: black !important; }
          .print-sheet { gap: 8px !important; }
          .barcode-label {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #ccc !important;
            box-shadow: none !important;
            background: white !important;
          }
        }
      `}</style>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/products" className="text-[var(--text-muted)] hover:text-[var(--text)]">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold">طباعة باركود</h1>
        </div>
        <Button onClick={() => window.print()} disabled={labels.length === 0}>
          <Printer className="h-4 w-4" />
          طباعة ({labels.length})
        </Button>
      </div>

      <Card className="no-print space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          اختر المنتجات وعدد الملصقات لكل منتج، ثم اطبع. الملصقات بدون باركود ستظهر فارغة.
        </p>
        {loading ? (
          <p className="py-6 text-center text-[var(--text-muted)]">جاري التحميل...</p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-sm font-medium">إضافة منتج</label>
                <select
                  value={pickerId}
                  onChange={(e) => setPickerId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5 text-sm"
                >
                  <option value="">اختر منتجاً...</option>
                  {allProducts
                    .filter((p) => !rows.some((r) => r.product.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.barcode ? `(${p.barcode})` : '— بدون باركود'}
                      </option>
                    ))}
                </select>
              </div>
              <Button type="button" variant="secondary" onClick={addProduct} disabled={!pickerId}>
                إضافة
              </Button>
            </div>

            {rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--text-muted)]">لم يُحدد أي منتج بعد</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li
                    key={row.product.id}
                    className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{row.product.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {row.product.barcode || 'بدون باركود'} · {formatMoney(row.product.sell_price, currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={99}
                        value={row.count}
                        onChange={(e) => setCount(row.product.id, e.target.value)}
                        className="w-20"
                        aria-label="عدد الملصقات"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRows((prev) => prev.filter((r) => r.product.id !== row.product.id))}
                      >
                        إزالة
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <div className="print-sheet grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {labels.map((p, idx) => (
          <div
            key={`${p.id}-${idx}`}
            className="barcode-label flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] bg-white p-2 text-center text-black"
          >
            <p className="line-clamp-2 w-full text-xs font-semibold leading-tight">{p.name}</p>
            <BarcodeSvg value={p.barcode || ''} className="max-w-full" />
            <p className="font-mono text-[10px] tracking-wide" dir="ltr">
              {p.barcode || '—'}
            </p>
            <p className="text-xs font-bold">{formatMoney(p.sell_price, currency)}</p>
            {p.sku ? <p className="text-[10px] text-gray-600">SKU: {p.sku}</p> : null}
          </div>
        ))}
      </div>
    </div>
  )
}
