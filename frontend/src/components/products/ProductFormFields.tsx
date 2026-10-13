import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, ScanBarcode, Wand2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { BarcodeScannerModal } from '../barcode/BarcodeScannerModal'
import { api, getErrorMessage } from '../../api/client'
import { normalizeImei } from '../../lib/productLookup'
import { clampQtyPrecision, quantityStep } from '../../lib/quantity'
import { useToastStore } from '../../stores/toastStore'
import type { Category } from '../../types'

export interface ProductFormValues {
  name: string
  sku: string
  barcode: string
  imei: string
  buy_price: string
  sell_price: string
  quantity: string
  low_stock_threshold: string
  category: string
  description: string
  publish_in_catalog: boolean
  is_catalog_offer: boolean
  allow_fractional_quantity: boolean
  quantity_precision: string
  unit: string
}

export const emptyProductForm = (): ProductFormValues => ({
  name: '',
  sku: '',
  barcode: '',
  imei: '',
  buy_price: '',
  sell_price: '',
  quantity: '1',
  low_stock_threshold: '5',
  category: '',
  description: '',
  publish_in_catalog: false,
  is_catalog_offer: false,
  allow_fractional_quantity: false,
  quantity_precision: '0',
  unit: '',
})

interface ProductFormFieldsProps {
  form: ProductFormValues
  setForm: React.Dispatch<React.SetStateAction<ProductFormValues>>
  categories: Category[]
  quantityLabel?: string
  quantityMin?: number
  showDescription?: boolean
  catalogEnabled?: boolean
  imageUrl?: string | null
  onImageChange?: (file: File | null) => void
  /** When editing, generate assigns barcode on the server */
  productId?: number | null
}

export function ProductFormFields({
  form,
  setForm,
  categories,
  quantityLabel = 'الكمية الافتتاحية',
  quantityMin = 1,
  showDescription = false,
  catalogEnabled = false,
  imageUrl,
  onImageChange,
  productId,
}: ProductFormFieldsProps) {
  const toast = useToastStore((s) => s.add)
  const [scanField, setScanField] = useState<'barcode' | 'imei' | null>(null)
  const [generatingBarcode, setGeneratingBarcode] = useState(false)

  const qtyPrecision = form.allow_fractional_quantity
    ? clampQtyPrecision(parseInt(form.quantity_precision, 10) || 0)
    : 0
  const qtyStep = form.allow_fractional_quantity ? quantityStep(qtyPrecision) : 1

  const generateBarcode = async () => {
    setGeneratingBarcode(true)
    try {
      const url = productId
        ? `/products/${productId}/generate-barcode/`
        : '/products/generate-barcode/'
      const { data } = await api.post<{ barcode: string; generated: boolean; detail?: string }>(url)
      setForm((f) => ({ ...f, barcode: data.barcode }))
      toast(
        data.generated ? 'تم توليد الباركود' : data.detail || 'الباركود الحالي للمنتج',
        'success',
      )
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setGeneratingBarcode(false)
    }
  }

  return (
    <>
      <Input
        label="اسم المنتج"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
        className="sm:col-span-2"
      />
      <Input label="SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-[var(--text)]">الباركود</label>
        <div className="flex flex-wrap gap-2">
          <Input
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            className="min-w-0 flex-1"
            placeholder="اختياري"
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 px-3"
            onClick={() => setScanField('barcode')}
            aria-label="مسح الباركود بالكاميرا"
            title="مسح بالكاميرا"
          >
            <ScanBarcode className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 px-3"
            onClick={generateBarcode}
            loading={generatingBarcode}
            aria-label="توليد باركود"
            title="توليد باركود"
          >
            <Wand2 className="h-5 w-5" />
          </Button>
          {form.barcode.trim() && productId ? (
            <Link
              to={`/products/barcode-print?ids=${productId}`}
              className="shrink-0"
              title="طباعة ملصق الباركود"
            >
              <Button type="button" variant="secondary" className="px-3">
                <Printer className="h-5 w-5" />
                <span className="hidden sm:inline">طباعة</span>
              </Button>
            </Link>
          ) : form.barcode.trim() && !productId ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3"
              onClick={() => toast('احفظ المنتج أولاً ثم اطبع الباركود', 'error')}
              title="احفظ المنتج أولاً للطباعة"
            >
              <Printer className="h-5 w-5" />
              <span className="hidden sm:inline">طباعة</span>
            </Button>
          ) : null}
        </div>
        {form.barcode.trim() && (
          <p className="text-xs text-[var(--text-muted)]">
            {productId
              ? 'اضغط «طباعة» لفتح ملصق الباركود ثم اطبع من المتصفح.'
              : 'بعد حفظ المنتج يظهر زر الطباعة بشكل كامل.'}
          </p>
        )}
      </div>
      <div className="space-y-1.5 sm:col-span-2">
        <label className="block text-sm font-medium text-[var(--text)]">IMEI</label>
        <div className="flex gap-2">
          <Input
            value={form.imei}
            onChange={(e) => setForm({ ...form, imei: e.target.value })}
            className="flex-1"
            lang="en"
            placeholder="للهواتف — اختياري"
          />
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 px-3"
            onClick={() => setScanField('imei')}
            aria-label="مسح IMEI بالكاميرا"
            title="مسح IMEI بالكاميرا"
          >
            <ScanBarcode className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <Input
        label="سعر الشراء (تكلفة المخزون — 0 للخدمات/التفعيل)"
        type="number"
        step="0.01"
        min="0"
        value={form.buy_price}
        onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
        required
      />
      <div>
        <Input
          label="سعر البيع"
          type="number"
          step="0.0001"
          min="0"
          value={form.sell_price}
          onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
          required
        />
        <p className="mt-1 text-xs text-[var(--text-muted)]">يدعم حتى 4 منازل عشرية (مثل 1.2345)</p>
      </div>
      <Input
        label={quantityLabel}
        type="number"
        min={quantityMin}
        step={qtyStep}
        value={form.quantity}
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
        required
      />
      <Input
        label="حد التنبيه"
        type="number"
        min={0}
        step={qtyStep}
        value={form.low_stock_threshold}
        onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
      />
      <Input
        label="وحدة القياس"
        value={form.unit}
        onChange={(e) => setForm({ ...form, unit: e.target.value })}
        placeholder="قطعة، متر، كغ..."
      />
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium">التصنيف</label>
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
        >
          <option value="">بدون تصنيف</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-3 sm:col-span-2">
        <input
          type="checkbox"
          checked={form.allow_fractional_quantity}
          onChange={(e) =>
            setForm({
              ...form,
              allow_fractional_quantity: e.target.checked,
              quantity_precision: e.target.checked ? form.quantity_precision || '2' : '0',
            })
          }
        />
        <span className="text-sm">السماح بكميات كسرية (مثل 1.5)</span>
      </label>
      {form.allow_fractional_quantity && (
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium">دقة الكمية (منازل عشرية)</label>
          <select
            value={form.quantity_precision}
            onChange={(e) => setForm({ ...form, quantity_precision: e.target.value })}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5"
          >
            <option value="0">0 (أعداد صحيحة)</option>
            <option value="1">1 (0.1)</option>
            <option value="2">2 (0.01)</option>
            <option value="3">3 (0.001)</option>
            <option value="4">4 (0.0001)</option>
          </select>
        </div>
      )}
      {showDescription && (
        <Input
          label="الوصف"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="sm:col-span-2"
        />
      )}
      {catalogEnabled && (
        <>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium">صورة المنتج</label>
            {imageUrl && (
              <img src={imageUrl} alt="" className="mb-2 h-24 rounded-lg object-cover" />
            )}
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onImageChange?.(e.target.files?.[0] || null)}
            />
          </div>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.publish_in_catalog}
              onChange={(e) => setForm({ ...form, publish_in_catalog: e.target.checked })}
            />
            <span className="text-sm">نشر في المعرض العام</span>
          </label>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.is_catalog_offer}
              onChange={(e) => setForm({ ...form, is_catalog_offer: e.target.checked })}
              disabled={!form.publish_in_catalog}
            />
            <span className="text-sm">عرض خاص في صفحة العروض</span>
          </label>
        </>
      )}
      <BarcodeScannerModal
        open={scanField !== null}
        onClose={() => setScanField(null)}
        onScan={(code) => {
          if (scanField === 'barcode') {
            setForm((f) => ({ ...f, barcode: code }))
            toast('تم قراءة الباركود', 'success')
          } else if (scanField === 'imei') {
            setForm((f) => ({ ...f, imei: normalizeImei(code) }))
            toast('تم قراءة IMEI', 'success')
          }
          setScanField(null)
        }}
        title={scanField === 'imei' ? 'مسح IMEI بالكاميرا' : 'مسح باركود المنتج'}
        hint={scanField === 'imei' ? 'وجّه الكاميرا نحو ملصق IMEI على الجهاز أو العلبة.' : undefined}
      />
    </>
  )
}
