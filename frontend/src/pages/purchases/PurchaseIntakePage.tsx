import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Trash2,
  Smartphone,
  Banknote,
  Split,
  ScanBarcode,
  PackagePlus,
  Plus,
  ChevronDown,
} from 'lucide-react'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import { BarcodeScannerModal } from '../../components/barcode/BarcodeScannerModal'
import {
  ProductFormFields,
  emptyProductForm,
  type ProductFormValues,
} from '../../components/products/ProductFormFields'
import { useToastStore } from '../../stores/toastStore'
import { useCurrentStore, useStoreVersion } from '../../hooks/useCurrentStore'
import { formatMoney, cn } from '../../lib/utils'
import { formatQtyDisplay } from '../../lib/quantity'
import { lookupProductByCode } from '../../lib/productLookup'
import { extractList } from '../../lib/apiHelpers'
import {
  cachedProductToProduct,
  getCachedSuppliers,
  nextTempId,
  putCachedProduct,
  searchCachedProducts,
} from '../../offline/cache'
import { enqueueOperation, newClientRequestId } from '../../offline/outbox'
import { applyLocalPurchaseQty, refreshOfflineCaches } from '../../offline/sync'
import { useOnlineStatus } from '../../offline/useOfflineSync'
import type { Category, Product, Purchase, Supplier } from '../../types'

interface CartItem {
  product: Product
  quantity: number
  unit_cost: number
}

export function PurchaseIntakePage() {
  const store = useCurrentStore()
  const online = useOnlineStatus()
  const currency = store?.currency
  const storeVersion = useStoreVersion()
  const toast = useToastStore((s) => s.add)
  const [categories, setCategories] = useState<Category[]>([])
  const [productForm, setProductForm] = useState<ProductFormValues>(emptyProductForm())
  const [formLoading, setFormLoading] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [discount, setDiscount] = useState('0')
  const [amountPaid, setAmountPaid] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [taxRate, setTaxRate] = useState(15)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  /** Maps temp product id → client_request_id for purchase dependsOn */
  const [pendingProductReqs, setPendingProductReqs] = useState<Record<number, string>>({})

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
      setProducts(data)
    } catch {
      if (store?.id) {
        const cached = await searchCachedProducts(store.id, q)
        setProducts(cached.map(cachedProductToProduct))
      }
    }
  }, [store?.id])

  useEffect(() => {
    if (!showSearch) return
    const t = setTimeout(() => searchProducts(query), 250)
    return () => clearTimeout(t)
  }, [query, searchProducts, showSearch])

  useEffect(() => {
    setCart([])
    setSupplierId('')
    setQuery('')
    setProducts([])
    setProductForm(emptyProductForm())
    setPendingProductReqs({})

    const load = async () => {
      if (!navigator.onLine && store?.id) {
        const cached = await getCachedSuppliers(store.id)
        setSuppliers(
          cached.map((s) => ({
            id: s.id,
            name: s.name,
            phone: s.phone,
            email: '',
            address: '',
            balance: s.balance,
            is_active: s.is_active,
          })),
        )
        return
      }
      try {
        const [{ data: cats }, { data: sups }] = await Promise.all([
          api.get<Category[] | { results: Category[] }>('/products/categories/'),
          api.get<Supplier[] | { results: Supplier[] }>('/purchases/suppliers/'),
        ])
        setCategories(extractList(cats))
        setSuppliers(extractList(sups))
        if (store?.id) void refreshOfflineCaches(store.id)
      } catch {
        if (store?.id) {
          const cached = await getCachedSuppliers(store.id)
          setSuppliers(
            cached.map((s) => ({
              id: s.id,
              name: s.name,
              phone: s.phone,
              email: '',
              address: '',
              balance: s.balance,
              is_active: s.is_active,
            })),
          )
        }
      }
      if (navigator.onLine) {
        api.get('/stores/current/').then(({ data }) => {
          setTaxRate(parseFloat(data.settings?.tax_rate || '15'))
        }).catch(() => {})
      }
    }
    void load()
  }, [storeVersion, store?.id])

  useEffect(() => {
    if (productForm.imei.trim() && productForm.quantity !== '1') {
      setProductForm((f) => ({ ...f, quantity: '1' }))
    }
  }, [productForm.imei, productForm.quantity])

  const addToCart = (product: Product, quantity = 1, unitCost?: number) => {
    const cost = unitCost ?? parseFloat(product.buy_price)
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id)
      if (existing) {
        return prev.map((c) =>
          c.product.id === product.id
            ? { ...c, quantity: c.quantity + quantity, unit_cost: unitCost ?? c.unit_cost }
            : c,
        )
      }
      return [...prev, { product, quantity, unit_cost: cost }]
    })
  }

  const resolveProductCode = useCallback(
    async (code: string) => {
      const trimmed = code.trim()
      if (!trimmed) return

      setLookupLoading(true)
      try {
        const product = await lookupProductByCode(trimmed)
        if (product) {
          addToCart(product)
          toast(`أُضيف إلى السلة: ${product.name}`, 'success')
          setQuery('')
          setProducts([])
          return
        }
        toast('لم يُعثر على منتج — أضفه من النموذج أعلاه', 'info')
        setQuery(trimmed)
        await searchProducts(trimmed)
      } catch (err) {
        toast(getErrorMessage(err), 'error')
      } finally {
        setLookupLoading(false)
      }
    },
    [toast, searchProducts],
  )

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      e.preventDefault()
      resolveProductCode(query)
    }
  }

  const addFromForm = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseInt(productForm.quantity, 10)
    const buyPrice = parseFloat(productForm.buy_price)
    const sellPrice = parseFloat(productForm.sell_price || '0')

    if (!productForm.name.trim()) {
      toast('اسم المنتج مطلوب', 'error')
      return
    }
    if (Number.isNaN(buyPrice) || buyPrice < 0) {
      toast('سعر الشراء غير صالح (يُسمح بـ 0 للخدمات)', 'error')
      return
    }
    if (!qty || qty < 1) {
      toast('الكمية يجب أن تكون 1 على الأقل', 'error')
      return
    }
    if (productForm.imei.trim() && qty !== 1) {
      toast('المنتج ذو IMEI يجب أن تكون كميته 1', 'error')
      return
    }

    setFormLoading(true)
    try {
      const code = productForm.imei.trim() || productForm.barcode.trim() || productForm.sku.trim()
      if (code) {
        const existing = await lookupProductByCode(code)
        if (existing) {
          addToCart(existing, qty, buyPrice)
          toast(`منتج موجود — أُضيف للسلة: ${existing.name}`, 'success')
          setProductForm(emptyProductForm())
          return
        }
      }

      const payload = {
        name: productForm.name.trim(),
        sku: productForm.sku,
        barcode: productForm.barcode,
        imei: productForm.imei,
        buy_price: productForm.buy_price,
        sell_price: sellPrice > 0 ? productForm.sell_price : productForm.buy_price,
        quantity: 0,
        low_stock_threshold: parseInt(productForm.low_stock_threshold, 10) || 5,
        category: productForm.category ? parseInt(productForm.category, 10) : null,
        description: productForm.description,
        allow_fractional_quantity: productForm.allow_fractional_quantity,
        quantity_precision: productForm.allow_fractional_quantity
          ? Math.min(3, Math.max(0, parseInt(productForm.quantity_precision, 10) || 0))
          : 0,
        unit: productForm.unit,
      }

      if (!navigator.onLine) {
        if (!store?.id) {
          toast('لا يمكن إنشاء منتج دون اتصال بدون متجر', 'error')
          return
        }
        const clientRequestId = newClientRequestId()
        const tempId = nextTempId()
        const localProduct: Product = {
          id: tempId,
          name: payload.name,
          sku: payload.sku,
          barcode: payload.barcode,
          imei: payload.imei,
          buy_price: String(payload.buy_price),
          sell_price: String(payload.sell_price),
          quantity: 0,
          low_stock_threshold: payload.low_stock_threshold,
          category: payload.category,
          category_name: '',
          is_active: true,
          is_low_stock: false,
          allow_fractional_quantity: payload.allow_fractional_quantity,
          quantity_precision: payload.quantity_precision,
          unit: payload.unit,
        }
        await enqueueOperation({
          storeId: store.id,
          operation: 'product.create',
          method: 'POST',
          path: '/products/',
          payload,
          localLabel: `منتج: ${payload.name}`,
          clientRequestId,
          localTempId: tempId,
        })
        await putCachedProduct(store.id, localProduct)
        setPendingProductReqs((m) => ({ ...m, [tempId]: clientRequestId }))
        addToCart(localProduct, qty, buyPrice)
        toast(`حُفظ المنتج محلياً وأُضيف للسلة: ${localProduct.name}`, 'success')
        setProductForm(emptyProductForm())
        return
      }

      const { data: created } = await api.post<Product>('/products/', payload)
      addToCart(created, qty, buyPrice)
      toast(`تم إنشاء المنتج وإضافته للسلة: ${created.name}`, 'success')
      setProductForm(emptyProductForm())
      if (store?.id) void refreshOfflineCaches(store.id)
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setFormLoading(false)
    }
  }

  const updateCartCost = (productId: number, raw: string) => {
    const num = parseFloat(raw)
    if (raw !== '' && (Number.isNaN(num) || num < 0)) return
    setCart((c) =>
      c.map((x) =>
        x.product.id === productId
          ? { ...x, unit_cost: raw === '' ? 0 : num }
          : x,
      ),
    )
  }

  const subtotal = cart.reduce((s, c) => s + c.unit_cost * c.quantity, 0)
  const discountNum = parseFloat(discount) || 0
  const tax = (subtotal - discountNum) * (taxRate / 100)
  const total = subtotal - discountNum + tax
  const selectedSupplier = suppliers.find((s) => String(s.id) === supplierId)

  const checkout = async () => {
    if (cart.length === 0) return
    if (paymentMethod === 'partial' && !supplierId) {
      toast('الدفع الجزئي يتطلب اختيار مورد', 'error')
      return
    }
    if (cart.some((c) => c.unit_cost <= 0)) {
      toast('أدخل سعر شراء صحيحاً لكل منتج في السلة', 'error')
      return
    }
    setLoading(true)
    const clientRequestId = newClientRequestId()
    const payload = {
      supplier_id: supplierId ? parseInt(supplierId, 10) : null,
      payment_method: paymentMethod,
      discount: discountNum,
      amount_paid: amountPaid ? parseFloat(amountPaid) : total,
      notes,
      items: cart.map((c) => ({
        product_id: c.product.id,
        quantity: c.quantity,
        unit_cost: c.unit_cost,
      })),
    }
    const dependsOn = cart
      .map((c) => pendingProductReqs[c.product.id])
      .filter(Boolean) as string[]

    const saveOffline = async (adjustQty: boolean) => {
      if (!store?.id) {
        toast('لا يمكن الشراء دون اتصال بدون متجر', 'error')
        return false
      }
      const entry = await enqueueOperation({
        storeId: store.id,
        operation: 'purchase.create',
        method: 'POST',
        path: '/purchases/create/',
        payload,
        localLabel: `شراء OFF-${clientRequestId.slice(0, 8).toUpperCase()}`,
        clientRequestId,
        dependsOn,
      })
      if (adjustQty) await applyLocalPurchaseQty(store.id, payload.items)
      toast(`حُفظت فاتورة الشراء محلياً ${entry.localLabel} — ستُزامَن عند الاتصال`, 'success')
      setCart([])
      setDiscount('0')
      setAmountPaid('')
      setNotes('')
      setPendingProductReqs({})
      return true
    }

    try {
      if (!navigator.onLine) {
        await saveOffline(true)
        return
      }
      const { data } = await api.post<Purchase>('/purchases/create/', {
        ...payload,
        client_request_id: clientRequestId,
      })
      toast(`تم إنشاء فاتورة الشراء ${data.invoice_number} وإدخال المخزون`, 'success')
      if (store?.id) void refreshOfflineCaches(store.id)
      setCart([])
      setDiscount('0')
      setAmountPaid('')
      setNotes('')
      setPendingProductReqs({})
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
        <h1 className="text-2xl font-bold">إدخال مشتريات</h1>
        {!online && (
          <span className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs text-orange-800 dark:text-orange-100">
            غير متصل — الشراء يُحفظ محلياً
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <h3 className="mb-4 font-semibold">بيانات المنتج</h3>
            <form onSubmit={addFromForm} className="grid gap-4 sm:grid-cols-2">
              <ProductFormFields
                form={productForm}
                setForm={setProductForm}
                categories={categories}
                quantityLabel="الكمية"
              />
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={formLoading} className="flex-1">
                  <Plus className="h-4 w-4" />
                  أضف للسلة
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <button
              type="button"
              onClick={() => setShowSearch((v) => !v)}
              className="flex w-full items-center justify-between text-right font-semibold"
            >
              <span className="text-sm font-normal text-[var(--text-muted)]">
                اختياري — للمنتجات المسجلة مسبقاً
              </span>
              <span className="flex items-center gap-2">
                بحث منتج موجود
                <ChevronDown className={cn('h-4 w-4 transition-transform', showSearch && 'rotate-180')} />
              </span>
            </button>
            {showSearch && (
              <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-muted)]" />
                    <Input
                      placeholder="ابحث بالاسم أو امسح الباركود / IMEI..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleSearchKeyDown}
                      className="pr-11"
                      disabled={lookupLoading}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 px-3"
                    onClick={() => setScannerOpen(true)}
                    aria-label="مسح بالكاميرا"
                    title="مسح بالكاميرا"
                  >
                    <ScanBarcode className="h-5 w-5" />
                  </Button>
                </div>
                {products.length > 0 && (
                  <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[var(--border)]">
                    {products.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            addToCart(p)
                            toast(`أُضيف: ${p.name}`, 'success')
                            setQuery('')
                            setProducts([])
                          }}
                          className="flex w-full items-center justify-between px-4 py-3 text-right hover:bg-[var(--bg-muted)]"
                        >
                          <span>
                            <span className="font-medium">{p.name}</span>
                            <span className="mr-2 text-xs text-[var(--text-muted)]">
                              (مخزون:{' '}
                              {formatQtyDisplay(p.quantity, {
                                allowFractional: p.allow_fractional_quantity,
                                precision: p.quantity_precision,
                              })}
                              )
                            </span>
                          </span>
                          <span className="text-[var(--primary)]">{formatMoney(p.buy_price, currency)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">السلة ({cart.length})</h3>
            {cart.length === 0 ? (
              <p className="py-8 text-center text-[var(--text-muted)]">أضف منتجات من النموذج أعلاه</p>
            ) : (
              <ul className="space-y-2">
                {cart.map((item) => (
                  <li
                    key={item.product.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-[var(--bg-muted)] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{item.product.name}</p>
                      {(item.product.imei || item.product.barcode) && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {item.product.imei && `IMEI: ${item.product.imei}`}
                          {item.product.imei && item.product.barcode && ' · '}
                          {item.product.barcode && `باركود: ${item.product.barcode}`}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex items-center gap-1.5 text-[var(--text-muted)]">
                          <span>سعر الشراء</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.unit_cost}
                            onChange={(e) => updateCartCost(item.product.id, e.target.value)}
                            className="w-24 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-left font-medium text-[var(--text)] [font-variant-numeric:tabular-nums]"
                            lang="en"
                          />
                        </label>
                        <span className="text-[var(--text-muted)]">
                          × {item.quantity} = {formatMoney(item.unit_cost * item.quantity, currency)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!item.product.imei && (
                        <>
                          <button
                            type="button"
                            className="rounded-lg bg-[var(--bg-card)] px-2 py-1"
                            onClick={() =>
                              setCart((c) =>
                                c.map((x) =>
                                  x.product.id === item.product.id && x.quantity > 1
                                    ? { ...x, quantity: x.quantity - 1 }
                                    : x,
                                ),
                              )
                            }
                          >
                            −
                          </button>
                          <span className="w-6 text-center">{item.quantity}</span>
                          <button
                            type="button"
                            className="rounded-lg bg-[var(--bg-card)] px-2 py-1"
                            onClick={() =>
                              setCart((c) =>
                                c.map((x) =>
                                  x.product.id === item.product.id
                                    ? { ...x, quantity: x.quantity + 1 }
                                    : x,
                                ),
                              )
                            }
                          >
                            +
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setCart((c) => c.filter((x) => x.product.id !== item.product.id))}
                        className="text-[var(--danger)]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card className="lg:col-span-2 h-fit">
          <h3 className="mb-4 font-semibold">الدفع</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-[var(--text-muted)]">المورد</label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2"
              >
                <option value="">بدون مورد</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.phone ? ` — ${s.phone}` : ''}</option>
                ))}
              </select>
              {selectedSupplier && parseFloat(selectedSupplier.balance) > 0 && (
                <p className="mt-2 text-xs text-[var(--danger)]">
                  مستحقات سابقة: {formatMoney(selectedSupplier.balance, currency)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {[
                { id: 'cash', icon: Banknote, label: 'نقدي' },
                { id: 'electronic', icon: Smartphone, label: 'إلكتروني' },
                { id: 'partial', icon: Split, label: 'جزئي' },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPaymentMethod(id)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-xl border py-3 text-sm transition-colors',
                    paymentMethod === id
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                      : 'border-[var(--border)]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
            <Input label="خصم" type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            <Input label="ملاحظات" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {paymentMethod === 'partial' && (
              <>
                <Input
                  label="المبلغ المدفوع الآن"
                  type="number"
                  step="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  required
                />
                {!supplierId && (
                  <p className="text-xs text-amber-600">اختر مورداً لتسجيل المتبقي على حسابه</p>
                )}
              </>
            )}
            <div className="space-y-2 rounded-xl bg-[var(--bg-muted)] p-4 text-sm">
              <div className="flex justify-between"><span>المجموع</span><span>{formatMoney(subtotal, currency)}</span></div>
              <div className="flex justify-between"><span>خصم</span><span>{formatMoney(discountNum, currency)}</span></div>
              <div className="flex justify-between"><span>ضريبة {taxRate}%</span><span>{formatMoney(tax, currency)}</span></div>
              <div className="flex justify-between text-lg font-bold">
                <span>الإجمالي</span>
                <span className="text-[var(--primary)]">{formatMoney(total, currency)}</span>
              </div>
            </div>
            <Button className="w-full" size="lg" onClick={checkout} loading={loading} disabled={cart.length === 0}>
              <PackagePlus className="h-5 w-5" />
              إتمام الشراء وإدخال المخزون
            </Button>
          </div>
        </Card>
      </div>
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={resolveProductCode}
        title="مسح باركود أو IMEI لمنتج موجود"
      />
    </div>
  )
}
