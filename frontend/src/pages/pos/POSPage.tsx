import { useState, useEffect, useCallback } from 'react'
import { Search, Trash2, Smartphone, Plus, ScanBarcode } from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { BarcodeScannerModal } from '../../components/barcode/BarcodeScannerModal'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { formatMoney, cn } from '../../lib/utils'
import {
  buildRateMap,
  convertAmount,
  displayRateFromInternal,
  rateQuoteLabel,
  parsePrice,
  priceInputValue,
  roundMoney,
  roundPrice,
  usesCurrencyToBaseQuote,
  resolveCurrency,
} from '../../lib/currencies'
import { lookupProductByCode } from '../../lib/productLookup'
import { extractList } from '../../lib/apiHelpers'
import { downloadPdfSafe } from '../../lib/downloadPdf'
import { clampQtyPrecision, formatQtyDisplay, parseQtyInput, quantityStep, roundQty } from '../../lib/quantity'
import { CustomerDebtRefs } from '../../components/customers/CustomerDebtRefs'
import {
  cachedProductToProduct,
  getCachedCustomers,
  lookupCachedProduct,
  searchCachedProducts,
} from '../../offline/cache'
import { enqueueSale } from '../../offline/outbox'
import { applyLocalSaleQty, refreshOfflineCaches } from '../../offline/sync'
import { useOnlineStatus } from '../../offline/useOfflineSync'
import type { Customer, Product, Sale, SalePaymentMethod, StoreCurrenciesResponse } from '../../types'

function newClientRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const TENDER_METHODS: { id: SalePaymentMethod; label: string }[] = [
  { id: 'cash', label: 'نقدي' },
  { id: 'card', label: 'بطاقة' },
  { id: 'bank_transfer', label: 'تحويل بنكي' },
  { id: 'e_wallet', label: 'محفظة' },
  { id: 'electronic', label: 'إلكتروني' },
  { id: 'other', label: 'أخرى' },
]

interface CartItem {
  product: Product
  quantity: number
  unit_price: number
}

interface PaymentLine {
  method: SalePaymentMethod
  amount: string
}

function productAllowsFractional(product: Product) {
  return Boolean(product.allow_fractional_quantity)
}

function productPrecision(product: Product) {
  return clampQtyPrecision(product.quantity_precision ?? 0)
}

function productQtyStep(product: Product) {
  return productAllowsFractional(product) ? quantityStep(productPrecision(product)) : 1
}

function minSellableQty(product: Product) {
  return productAllowsFractional(product) ? productQtyStep(product) : 1
}

export function POSPage() {
  const store = useCurrentStore()
  const online = useOnlineStatus()
  const baseCurrency = resolveCurrency(store?.currency)
  const storeVersion = useStoreVersion()
  const toast = useToastStore((s) => s.add)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState('')
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: 'cash', amount: '' }])
  const [allowCredit, setAllowCredit] = useState(false)
  const [paymentCurrency, setPaymentCurrency] = useState(baseCurrency)
  const [exchangeRateOverride, setExchangeRateOverride] = useState('')
  const [currencyRows, setCurrencyRows] = useState<StoreCurrenciesResponse['currencies']>([])
  const [activeCurrencies, setActiveCurrencies] = useState<string[]>([baseCurrency])
  const [discount, setDiscount] = useState('0')
  const [loading, setLoading] = useState(false)
  const [taxRate, setTaxRate] = useState(15)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)

  const searchProducts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setProducts([])
      return
    }
    if (!navigator.onLine && store?.id) {
      const cached = await searchCachedProducts(store.id, q)
      setProducts(cached.map(cachedProductToProduct))
      return
    }
    try {
      const { data } = await api.get<Product[]>('/products/search/', { params: { q } })
      setProducts(
        data.map((p) => ({
          ...p,
          quantity: Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : 0,
        })),
      )
    } catch {
      if (store?.id) {
        const cached = await searchCachedProducts(store.id, q)
        setProducts(cached.map(cachedProductToProduct))
      }
    }
  }, [store?.id])

  useEffect(() => {
    const t = setTimeout(() => searchProducts(query), 250)
    return () => clearTimeout(t)
  }, [query, searchProducts])

  useEffect(() => {
    setCart([])
    setCustomerId('')
    setQuery('')
    setProducts([])
    setPaymentCurrency(baseCurrency)
    setExchangeRateOverride('')
    setPaymentLines([{ method: 'cash', amount: '' }])
    setAllowCredit(false)

    const loadCustomers = async () => {
      if (!navigator.onLine && store?.id) {
        const cached = await getCachedCustomers(store.id)
        setCustomers(
          cached.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            email: '',
            debt: c.debt,
            is_active: c.is_active,
          })),
        )
        return
      }
      try {
        const { data } = await api.get<Customer[] | { results: Customer[] }>('/customers/')
        setCustomers(extractList(data))
        if (store?.id) void refreshOfflineCaches(store.id)
      } catch {
        if (store?.id) {
          const cached = await getCachedCustomers(store.id)
          setCustomers(
            cached.map((c) => ({
              id: c.id,
              name: c.name,
              phone: c.phone,
              email: '',
              debt: c.debt,
              is_active: c.is_active,
            })),
          )
        }
      }
    }

    void loadCustomers()

    if (navigator.onLine) {
      api.get('/stores/current/').then(({ data }) => {
        setTaxRate(parseFloat(data.settings?.tax_rate || '15'))
      }).catch(() => {})
      api.get<StoreCurrenciesResponse>('/stores/currencies/').then(({ data }) => {
        setCurrencyRows(data.currencies)
        const active = data.currencies.filter((c) => c.is_active).map((c) => c.code)
        setActiveCurrencies(active.length ? active : [data.base_currency])
        setPaymentCurrency(data.base_currency)
      }).catch(() => {
        setCurrencyRows([])
        setActiveCurrencies([baseCurrency])
      })
    }
  }, [storeVersion, baseCurrency, store?.id])

  const currencyRates = buildRateMap(currencyRows)

  const defaultDisplayRate = (code: string) => {
    const row = currencyRows.find((c) => c.code === code)
    if (row?.display_rate) return row.display_rate
    const rtb = currencyRates.get(code) ?? 1
    return String(displayRateFromInternal(baseCurrency, code, rtb))
  }

  const isServiceProduct = (product: Product) => {
    const buy = parseFloat(String(product.buy_price || '0'))
    return !Number.isNaN(buy) && buy === 0
  }

  /** المخزون من الـ API قد يأتي كنص Decimal مثل "5.000" — يجب تحويله لرقم قبل أي مقارنة */
  const stockQty = (product: Product) => {
    const n = Number(product.quantity)
    return Number.isFinite(n) ? n : 0
  }

  const maxSellableQty = (product: Product) => {
    const stock = stockQty(product)
    if (isServiceProduct(product)) return Math.max(stock, 9999)
    return stock
  }

  const addToCart = (product: Product, delta?: number) => {
    const step = Number(delta ?? minSellableQty(product))
    const normalized: Product = {
      ...product,
      quantity: stockQty(product),
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === normalized.id)
      const maxQty = maxSellableQty(normalized)
      if (existing) {
        const nextQty = roundQty(
          Number(existing.quantity) + step,
          productAllowsFractional(normalized) ? productPrecision(normalized) : 0,
        )
        if (nextQty > maxQty + 1e-9) {
          toast('الكمية غير كافية', 'error')
          return prev
        }
        return prev.map((c) =>
          c.product.id === normalized.id
            ? { ...c, product: { ...c.product, quantity: maxQty }, quantity: nextQty }
            : c,
        )
      }
      const initial = Math.min(step, maxQty)
      if (initial <= 0) {
        toast('المنتج غير متوفر', 'error')
        return prev
      }
      return [
        ...prev,
        {
          product: normalized,
          quantity: roundQty(
            initial,
            productAllowsFractional(normalized) ? productPrecision(normalized) : 0,
          ),
          unit_price: parsePrice(normalized.sell_price),
        },
      ]
    })
    setQuery('')
    setProducts([])
  }

  const updateCartQty = (productId: number, raw: string) => {
    const product = cart.find((c) => c.product.id === productId)?.product
    if (!product) return
    const maxQty = maxSellableQty(product)
    const allowFractional = productAllowsFractional(product)
    const precision = productPrecision(product)
    const minQty = minSellableQty(product)
    const parsed = parseQtyInput(raw, {
      allowFractional,
      precision,
      min: minQty,
      max: maxQty,
    })
    if (parsed == null) {
      setCart((c) => c.map((x) => (x.product.id === productId ? { ...x, quantity: minQty } : x)))
      return
    }
    const rawNum = allowFractional ? parseFloat(raw) : parseInt(raw, 10)
    if (!Number.isNaN(rawNum) && rawNum > maxQty) toast('الكمية غير كافية', 'error')
    setCart((c) => c.map((x) => (x.product.id === productId ? { ...x, quantity: parsed } : x)))
  }

  const bumpQty = (product: Product, direction: -1 | 1) => {
    const step = productQtyStep(product)
    if (direction < 0) {
      setCart((prev) =>
        prev
          .map((x) => {
            if (x.product.id !== product.id) return x
            const next = roundQty(
              x.quantity - step,
              productAllowsFractional(product) ? productPrecision(product) : 0,
            )
            return { ...x, quantity: next }
          })
          .filter((x) => x.quantity > 0),
      )
      return
    }
    addToCart(product, step)
  }

  const resolveProductCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return

      setLookupLoading(true)
      try {
        let product: Product | null = null
        if (navigator.onLine) {
          try {
            product = await lookupProductByCode(trimmed)
          } catch {
            product = null
          }
        }
        if (!product && store?.id) {
          const cached = await lookupCachedProduct(store.id, trimmed)
          if (cached) product = cachedProductToProduct(cached)
        }
        if (product) {
          addToCart(product)
          toast(`أُضيف إلى السلة: ${product.name}`, 'success')
          return
        }
        toast('لم يُعثر على منتج بهذا الباركود أو IMEI', 'error')
        setQuery(trimmed)
        await searchProducts(trimmed)
      } catch (err) {
        toast(getErrorMessage(err), 'error')
      } finally {
        setLookupLoading(false)
      }
    },
    [toast, searchProducts, store?.id],
  )

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      resolveProductCode(query)
    }
  }

  const updateCartPrice = (productId: number, raw: string) => {
    if (raw.trim() === '') {
      setCart((c) =>
        c.map((x) => (x.product.id === productId ? { ...x, unit_price: 0 } : x)),
      )
      return
    }
    const num = parseFloat(raw)
    if (Number.isNaN(num) || num < 0) return
    setCart((c) =>
      c.map((x) =>
        x.product.id === productId
          ? { ...x, unit_price: roundPrice(num) }
          : x,
      ),
    )
  }

  const effectiveRates = (() => {
    const rates = new Map(currencyRates)
    if (paymentCurrency !== baseCurrency) {
      const display = roundMoney(
        parseFloat(exchangeRateOverride || defaultDisplayRate(paymentCurrency)),
      )
      if (display > 0) {
        rates.set(
          paymentCurrency,
          usesCurrencyToBaseQuote(paymentCurrency, baseCurrency) ? display : 1 / display,
        )
      }
    }
    return rates
  })()

  /** تحويل للعرض/الدفع حتى 4 منازل (أسعار البيع والإجماليات والمدفوعات). */
  const toPayment = (amount: number) =>
    convertAmount(amount, baseCurrency, paymentCurrency, baseCurrency, effectiveRates, 4)

  /** مبلغ سطر السلة: يحافظ على دقة سعر الوحدة (حتى 4) قبل تقريب المدفوعات. */
  const formatLineAmount = (amountBase: number) =>
    formatMoney(
      convertAmount(
        amountBase,
        baseCurrency,
        paymentCurrency,
        baseCurrency,
        effectiveRates,
        4,
      ),
      paymentCurrency,
    )

  const subtotalBase = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0)
  const discountNum = parseFloat(discount) || 0
  const taxBase = (subtotalBase - discountNum) * (taxRate / 100)
  const totalBase = subtotalBase - discountNum + taxBase
  const subtotal = toPayment(subtotalBase)
  const tax = toPayment(taxBase)
  const total = toPayment(totalBase)
  const discountDisplay = toPayment(discountNum)
  const selectedCustomer = customers.find((c) => String(c.id) === customerId)

  const usedMethods = new Set(paymentLines.map((l) => l.method))

  const paidSum = (() => {
    const explicit = paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    if (paymentLines.length === 1 && paymentLines[0].amount.trim() === '') {
      return allowCredit ? 0 : roundPrice(total)
    }
    return roundPrice(explicit)
  })()

  const remainingDue = roundPrice(Math.max(0, total - paidSum))
  const hasCredit = allowCredit && remainingDue > 0.00005

  const setLineMethod = (index: number, method: SalePaymentMethod) => {
    setPaymentLines((lines) => lines.map((l, i) => (i === index ? { ...l, method } : l)))
  }

  const setLineAmount = (index: number, amount: string) => {
    setPaymentLines((lines) => lines.map((l, i) => (i === index ? { ...l, amount } : l)))
  }

  const addPaymentLine = () => {
    const next = TENDER_METHODS.find((m) => !usedMethods.has(m.id))
    if (!next) {
      toast('استُخدمت كل طرق الدفع', 'error')
      return
    }
    setPaymentLines((lines) => [...lines, { method: next.id, amount: '' }])
  }

  const removePaymentLine = (index: number) => {
    setPaymentLines((lines) => (lines.length <= 1 ? lines : lines.filter((_, i) => i !== index)))
  }

  const fillRemainingOnLine = (index: number) => {
    const others = paymentLines.reduce(
      (s, l, i) => (i === index ? s : s + (parseFloat(l.amount) || 0)),
      0,
    )
    const fill = roundPrice(Math.max(0, total - others))
    setLineAmount(index, priceInputValue(fill))
  }

  const buildPaymentsPayload = () => {
    if (paymentLines.length === 1 && paymentLines[0].amount.trim() === '' && !allowCredit) {
      return [{ method: paymentLines[0].method, amount: roundPrice(total) }]
    }
    return paymentLines
      .map((l) => ({ method: l.method, amount: roundPrice(parseFloat(l.amount) || 0) }))
      .filter((l) => l.amount > 0)
  }

  const checkout = async () => {
    if (cart.length === 0) return
    const payments = buildPaymentsPayload()
    const allocated = roundPrice(payments.reduce((s, p) => s + p.amount, 0))
    const remaining = roundPrice(Math.max(0, total - allocated))

    if (remaining > 0.00005 && !allowCredit) {
      toast('المبلغ المدفوع أقل من الإجمالي — فعّل الآجل أو أكمل الدفع', 'error')
      return
    }
    if (remaining > 0.00005 && !customerId) {
      toast('المتبقي الآجل يتطلب اختيار عميل', 'error')
      return
    }
    if (allocated > total + 0.00005) {
      toast('مجموع الدفعات يتجاوز إجمالي الفاتورة', 'error')
      return
    }
    if (payments.length === 0 && remaining <= 0.00005) {
      toast('أدخل مبلغ دفع واحداً على الأقل', 'error')
      return
    }
    if (cart.some((c) => c.unit_price <= 0)) {
      toast('أدخل سعراً صحيحاً لكل منتج في السلة', 'error')
      return
    }
    setLoading(true)
    const clientRequestId = newClientRequestId()
    const headerMethod =
      remaining > 0.00005
        ? 'partial'
        : payments.length === 1
          ? payments[0].method
          : payments[0]?.method || 'cash'

    const payload = {
      customer_id: customerId ? parseInt(customerId, 10) : null,
      payment_method: headerMethod,
      currency: paymentCurrency,
      discount: roundPrice(discountNum),
      amount_paid: allocated,
      payments,
      items: cart.map((c) => ({
        product_id: c.product.id,
        quantity: c.quantity,
        unit_price: roundPrice(c.unit_price),
      })),
      ...(paymentCurrency !== baseCurrency
        ? (() => {
            const display = roundMoney(
              parseFloat(exchangeRateOverride || defaultDisplayRate(paymentCurrency)),
            )
            return display > 0 ? { display_exchange_rate: display } : {}
          })()
        : {}),
    }

    const saveOffline = async (adjustLocalQty: boolean) => {
      if (!store?.id) {
        toast('لا يمكن البيع دون اتصال بدون متجر محدد', 'error')
        return false
      }
      const entry = await enqueueSale(store.id, payload, clientRequestId)
      if (adjustLocalQty) {
        await applyLocalSaleQty(store.id, payload.items)
      }
      toast(`حُفظت الفاتورة محلياً ${entry.localLabel} — ستُزامَن عند الاتصال`, 'success')
      setCart([])
      setDiscount('0')
      setPaymentLines([{ method: 'cash', amount: '' }])
      setAllowCredit(false)
      return true
    }

    try {
      if (!navigator.onLine) {
        await saveOffline(true)
        return
      }

      const { data } = await api.post<Sale>('/sales/create/', {
        ...payload,
        client_request_id: clientRequestId,
      })
      toast(`تم إنشاء الفاتورة ${data.invoice_number}`, 'success')
      await downloadPdfSafe(`/sales/${data.id}/pdf/`, `${data.invoice_number}.pdf`, (m) => toast(m, 'error'))
      if (store?.id) void refreshOfflineCaches(store.id)
      setCart([])
      setDiscount('0')
      setPaymentLines([{ method: 'cash', amount: '' }])
      setAllowCredit(false)
    } catch (err) {
      const isNetwork =
        !navigator.onLine ||
        (err as { code?: string; message?: string })?.code === 'ERR_NETWORK' ||
        (err as { message?: string })?.message === 'Network Error'
      if (isNetwork) {
        const ok = await saveOffline(false)
        if (ok) return
      }
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">نقطة البيع</h1>
        {!online && (
          <span className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-800 dark:text-orange-100">
            غير متصل — البيع يُحفظ محلياً
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-4 lg:col-span-3">
          <Card>
            <div className="flex items-stretch gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  placeholder="ابحث أو امسح الباركود / IMEI..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  className="pr-11 text-base sm:text-lg"
                  autoFocus
                  disabled={lookupLoading}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="h-auto shrink-0 px-3"
                onClick={() => setScannerOpen(true)}
                aria-label="مسح بالكاميرا"
                title="مسح بالكاميرا"
              >
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
            {products.length > 0 && (
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)]">
                {products.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addToCart(p)}
                      className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-right hover:bg-[var(--bg-muted)] sm:gap-3"
                    >
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-[var(--border)]"
                        />
                      ) : (
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-muted)] text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                          <Smartphone className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{p.name}</span>
                        <span className="text-xs text-[var(--text-muted)]">
                          متاح:{' '}
                          {formatQtyDisplay(stockQty(p), {
                            allowFractional: p.allow_fractional_quantity,
                            precision: p.quantity_precision,
                            unit: p.unit,
                          })}
                        </span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-sm text-[var(--primary)] sm:text-base">
                        {formatMoney(p.sell_price, baseCurrency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h3 className="mb-3 font-semibold">السلة</h3>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-[var(--text-muted)]">السلة فارغة</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((item) => {
                  const frac = productAllowsFractional(item.product)
                  const step = productQtyStep(item.product)
                  return (
                    <li
                      key={item.product.id}
                      className="flex flex-col gap-3 rounded-xl bg-[var(--bg-muted)] p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-[var(--border)] sm:h-14 sm:w-14"
                          />
                        ) : (
                          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-card)] text-[var(--text-muted)] ring-1 ring-[var(--border)] sm:h-14 sm:w-14">
                            <Smartphone className="h-6 w-6" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{item.product.name}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                            <label className="flex min-w-0 items-center gap-1.5 text-[var(--text-muted)]">
                              <span className="shrink-0">السعر</span>
                              <input
                                type="number"
                                min={0}
                                step="0.0001"
                                value={priceInputValue(item.unit_price)}
                                onChange={(e) => updateCartPrice(item.product.id, e.target.value)}
                                className="w-28 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1.5 text-left font-medium text-[var(--text)] [font-variant-numeric:tabular-nums] sm:py-1"
                                lang="en"
                              />
                            </label>
                            <span className="text-[var(--text-muted)]">
                              = {formatLineAmount(item.unit_price * Number(item.quantity))}
                            </span>
                          </div>
                          {item.unit_price > parsePrice(item.product.sell_price) + 1e-9 && (
                            <p className="mt-0.5 text-xs text-emerald-600">
                              أعلى من السعر الافتراضي ({formatMoney(item.product.sell_price, baseCurrency)})
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-card)] text-lg sm:h-8 sm:w-8 sm:text-base"
                            onClick={() => bumpQty(item.product, -1)}
                            aria-label="إنقاص الكمية"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={minSellableQty(item.product)}
                            max={maxSellableQty(item.product)}
                            step={step}
                            value={item.quantity}
                            onChange={(e) => updateCartQty(item.product.id, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="h-10 w-16 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-1 text-center font-medium tabular-nums text-[var(--text)] sm:h-8"
                            lang="en"
                            aria-label="الكمية"
                            inputMode={frac ? 'decimal' : 'numeric'}
                          />
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--bg-card)] text-lg sm:h-8 sm:w-8 sm:text-base"
                            onClick={() => bumpQty(item.product, 1)}
                            aria-label="زيادة الكمية"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCart((c) => c.filter((x) => x.product.id !== item.product.id))}
                          className="flex h-10 w-10 items-center justify-center text-[var(--danger)] sm:h-8 sm:w-8"
                          aria-label="حذف من السلة"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
        <Card className="min-w-0 lg:col-span-2">
          <h3 className="mb-4 font-semibold">الدفع</h3>
          <div className="space-y-4">
            <div className="min-w-0">
              <label className="text-sm text-[var(--text-muted)]">العميل</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1 w-full max-w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
              >
                <option value="">بدون عميل</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
              {selectedCustomer && (hasCredit || parseFloat(selectedCustomer.debt) > 0) &&
                (selectedCustomer.debt_references?.length || parseFloat(selectedCustomer.debt) > 0) && (
                <div className="mt-2 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-3">
                  <p className="text-xs text-[var(--text-muted)]">
                    دين سابق:{' '}
                    <span className="font-semibold text-[var(--danger)]">
                      {formatMoney(selectedCustomer.debt, baseCurrency)}
                    </span>
                  </p>
                  <CustomerDebtRefs
                    refs={selectedCustomer.debt_references || []}
                    currency={baseCurrency}
                    compact
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-[var(--text-muted)]">عملة الدفع</label>
              <select
                value={paymentCurrency}
                onChange={(e) => {
                  setPaymentCurrency(e.target.value)
                  setExchangeRateOverride('')
                }}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
              >
                {activeCurrencies.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            {paymentCurrency !== baseCurrency && (
              <>
                <Input
                  label={rateQuoteLabel(baseCurrency, paymentCurrency)}
                  type="number"
                  step="0.000001"
                  min="0"
                  value={exchangeRateOverride || defaultDisplayRate(paymentCurrency)}
                  onChange={(e) => setExchangeRateOverride(e.target.value)}
                />
                <p className="text-xs text-[var(--text-muted)]">اتركه حسب الإعدادات أو عدّله لهذه الفاتورة</p>
              </>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium">طرق الدفع</label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addPaymentLine}
                  disabled={paymentLines.length >= TENDER_METHODS.length}
                >
                  <Plus className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
              {paymentLines.map((line, index) => (
                <div
                  key={`${line.method}-${index}`}
                  className="flex flex-col gap-2 rounded-xl border border-[var(--border)] p-3 sm:flex-row sm:items-end"
                >
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs text-[var(--text-muted)]">الطريقة</label>
                    <select
                      value={line.method}
                      onChange={(e) => setLineMethod(index, e.target.value as SalePaymentMethod)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                    >
                      {TENDER_METHODS.map((m) => (
                        <option
                          key={m.id}
                          value={m.id}
                          disabled={usedMethods.has(m.id) && line.method !== m.id}
                        >
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs text-[var(--text-muted)]">المبلغ</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={line.amount}
                        placeholder={
                          paymentLines.length === 1 && !allowCredit
                            ? priceInputValue(total)
                            : '0'
                        }
                        onChange={(e) => setLineAmount(index, e.target.value)}
                        className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm"
                        lang="en"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        onClick={() => fillRemainingOnLine(index)}
                        title="تعبئة المتبقي"
                      >
                        كامل
                      </Button>
                    </div>
                  </div>
                  {paymentLines.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-[var(--danger)] sm:mb-0.5"
                      onClick={() => removePaymentLine(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <label
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-sm',
                  allowCredit ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)]',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={allowCredit}
                  onChange={(e) => setAllowCredit(e.target.checked)}
                />
                <span>
                  <span className="font-medium">المتبقي آجل على العميل</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    أي مبلغ غير مدفوع يُسجَّل ديناً — يتطلب اختيار عميل
                  </span>
                </span>
              </label>
              {hasCredit && !customerId && (
                <p className="text-xs text-amber-600">اختر عميلاً لتسجيل المتبقي على حسابه</p>
              )}
              {hasCredit && (
                <p className="text-xs text-[var(--text-muted)]">
                  المتبقي الآجل: {formatMoney(remainingDue, paymentCurrency)}
                </p>
              )}
            </div>

            <Input label="خصم" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <div className="space-y-2 rounded-xl bg-[var(--bg-muted)] p-4 text-sm">
              <div className="flex justify-between"><span>المجموع</span><span>{formatMoney(subtotal, paymentCurrency)}</span></div>
              <div className="flex justify-between"><span>خصم</span><span>{formatMoney(discountDisplay, paymentCurrency)}</span></div>
              <div className="flex justify-between"><span>ضريبة {taxRate}%</span><span>{formatMoney(tax, paymentCurrency)}</span></div>
              <div className="flex justify-between text-lg font-bold">
                <span>الإجمالي</span>
                <span className="text-[var(--primary)]">{formatMoney(total, paymentCurrency)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>المدفوع</span>
                <span>{formatMoney(paidSum, paymentCurrency)}</span>
              </div>
              {paymentCurrency !== baseCurrency && (
                <p className="text-xs text-[var(--text-muted)]">
                  ≈ {formatMoney(totalBase, baseCurrency)} بالعملة الأساسية
                </p>
              )}
            </div>
            <Button className="w-full" size="lg" onClick={checkout} loading={loading} disabled={cart.length === 0}>
              إتمام البيع
            </Button>
          </div>
        </Card>
      </div>
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={resolveProductCode}
        title="مسح باركود أو IMEI للبيع"
      />
    </div>
  )
}
