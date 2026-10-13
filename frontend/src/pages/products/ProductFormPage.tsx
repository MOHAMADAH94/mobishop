import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, getErrorMessage } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import {
  ProductFormFields,
  emptyProductForm,
  type ProductFormValues,
} from '../../components/products/ProductFormFields'
import { useAuthStore } from '../../stores/authStore'
import { useCurrentStore } from '../../hooks/useCurrentStore'
import { useToastStore } from '../../stores/toastStore'
import { extractList } from '../../lib/apiHelpers'
import { clampQtyPrecision, quantityStep } from '../../lib/quantity'
import { adjustCachedProductQty, putCachedProduct } from '../../offline/cache'
import { enqueueOperation, newClientRequestId } from '../../offline/outbox'
import { useOnlineStatus } from '../../offline/useOfflineSync'
import type { Category, Product } from '../../types'

export function ProductFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToastStore((s) => s.add)
  const store = useCurrentStore()
  const online = useOnlineStatus()
  const refreshStores = useAuthStore((s) => s.refreshStores)
  const catalogEnabled = Boolean(store?.catalog_enabled)
  const isEdit = Boolean(id)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<ProductFormValues>(emptyProductForm())
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [originalQty, setOriginalQty] = useState<number | null>(null)

  useEffect(() => {
    refreshStores().catch(() => {})
  }, [refreshStores])

  useEffect(() => {
    if (!navigator.onLine) {
      if (!isEdit) return
      toast('تحميل المنتج للتعديل يتطلب اتصالاً', 'error')
      return
    }
    api
      .get<Category[] | { results: Category[] }>('/products/categories/')
      .then(({ data }) => setCategories(extractList(data)))
      .catch((err) => toast(getErrorMessage(err), 'error'))

    if (id) {
      api.get<Product>(`/products/${id}/`).then(({ data }) => {
        setForm({
          name: data.name,
          sku: data.sku,
          barcode: data.barcode,
          imei: data.imei,
          buy_price: data.buy_price,
          sell_price: data.sell_price,
          quantity: String(data.quantity),
          low_stock_threshold: String(data.low_stock_threshold),
          category: data.category ? String(data.category) : '',
          description: data.description || '',
          publish_in_catalog: data.publish_in_catalog ?? false,
          is_catalog_offer: data.is_catalog_offer ?? false,
          allow_fractional_quantity: data.allow_fractional_quantity ?? false,
          quantity_precision: String(data.quantity_precision ?? 0),
          unit: data.unit || '',
        })
        setOriginalQty(Number(data.quantity))
        setImageUrl(data.image_url ?? null)
      })
    }
  }, [id, toast, isEdit])

  const parseFormQty = (raw: string) => {
    const n = form.allow_fractional_quantity ? parseFloat(raw) : parseInt(raw, 10)
    return Number.isNaN(n) ? 0 : n
  }

  const buildPayload = () => {
    const base = {
      name: form.name,
      sku: form.sku,
      barcode: form.barcode,
      imei: form.imei,
      buy_price: form.buy_price,
      sell_price: form.sell_price || '0',
      quantity: parseFormQty(form.quantity),
      low_stock_threshold: parseFormQty(form.low_stock_threshold),
      category: form.category ? parseInt(form.category, 10) : null,
      description: form.description,
      allow_fractional_quantity: form.allow_fractional_quantity,
      quantity_precision: form.allow_fractional_quantity
        ? clampQtyPrecision(parseInt(form.quantity_precision, 10) || 0)
        : 0,
      unit: form.unit,
    }
    if (!catalogEnabled) return base

    if (imageFile) {
      const fd = new FormData()
      Object.entries(base).forEach(([k, v]) => {
        if (v != null && v !== '') fd.append(k, String(v))
      })
      fd.append('publish_in_catalog', String(form.publish_in_catalog))
      fd.append('is_catalog_offer', String(form.is_catalog_offer))
      fd.append('image', imageFile)
      return fd
    }

    return {
      ...base,
      publish_in_catalog: form.publish_in_catalog,
      is_catalog_offer: form.is_catalog_offer,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const payload = buildPayload()
    const isMultipart = payload instanceof FormData
    const clientRequestId = newClientRequestId()

    try {
      if (!navigator.onLine) {
        if (!store?.id) {
          toast('لا يمكن الحفظ دون متجر', 'error')
          return
        }
        if (isMultipart || imageFile) {
          toast('رفع الصور يتطلب اتصالاً', 'error')
          return
        }
        if (isEdit && id) {
          const newQty = parseFormQty(form.quantity)
          const delta = originalQty == null ? 0 : newQty - originalQty
          if (delta === 0) {
            toast('تعديل بيانات المنتج (غير الكمية) يتطلب اتصالاً', 'error')
            return
          }
          await enqueueOperation({
            storeId: store.id,
            operation: 'inventory.adjust',
            method: 'POST',
            path: `/products/${id}/adjust_stock/`,
            payload: {
              quantity_change: delta,
              action: 'adjust',
              notes: 'تعديل كمية دون اتصال',
            },
            localLabel: `مخزون: ${form.name} (${delta > 0 ? '+' : ''}${delta})`,
            clientRequestId,
          })
          await adjustCachedProductQty(store.id, parseInt(id, 10), delta)
          toast('حُفظ تعديل المخزون محلياً — سيُزامَن عند الاتصال', 'success')
          navigate('/products')
          return
        }

        const body = payload as Record<string, unknown>
        const tempId = -Date.now()
        await enqueueOperation({
          storeId: store.id,
          operation: 'product.create',
          method: 'POST',
          path: '/products/',
          payload: body,
          localLabel: `منتج: ${form.name}`,
          clientRequestId,
          localTempId: tempId,
        })
        await putCachedProduct(store.id, {
          id: tempId,
          name: form.name,
          sku: form.sku,
          barcode: form.barcode,
          imei: form.imei,
          buy_price: form.buy_price,
          sell_price: form.sell_price || '0',
          quantity: parseFormQty(form.quantity),
          low_stock_threshold: parseFormQty(form.low_stock_threshold) || 5,
          category: form.category ? parseInt(form.category, 10) : null,
          category_name: '',
          is_active: true,
          is_low_stock: false,
          allow_fractional_quantity: form.allow_fractional_quantity,
          quantity_precision: form.allow_fractional_quantity
            ? clampQtyPrecision(parseInt(form.quantity_precision, 10) || 0)
            : 0,
          unit: form.unit,
        })
        toast('حُفظ المنتج محلياً — سيُزامَن عند الاتصال', 'success')
        navigate('/products')
        return
      }

      // Content-Type لـ FormData يُزال في interceptor العميل
      let saved: Product | null = null
      if (isEdit) {
        const { data } = await api.patch<Product>(`/products/${id}/`, payload)
        saved = data
      } else if (isMultipart) {
        ;(payload as FormData).append('client_request_id', clientRequestId)
        const { data } = await api.post<Product>('/products/', payload)
        saved = data
      } else {
        const { data } = await api.post<Product>(
          '/products/',
          { ...(payload as object), client_request_id: clientRequestId },
        )
        saved = data
      }
      if (saved && store?.id) {
        const cachedId = Number(saved.id) || (id ? parseInt(id, 10) : NaN)
        if (Number.isFinite(cachedId)) {
          await putCachedProduct(store.id, { ...saved, id: cachedId })
        }
      }
      toast(isEdit ? 'تم التحديث' : 'تمت الإضافة', 'success')
      navigate('/products')
    } catch (err) {
      toast(getErrorMessage(err), 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{isEdit ? 'تعديل منتج' : 'منتج جديد'}</h1>
        {!online && (
          <span className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs">
            غير متصل
          </span>
        )}
      </div>
      <Card>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <ProductFormFields
            form={form}
            setForm={setForm}
            categories={categories}
            quantityLabel={isEdit ? 'الكمية' : 'الكمية الافتتاحية'}
            quantityMin={
              isEdit
                ? 0
                : form.allow_fractional_quantity
                  ? quantityStep(clampQtyPrecision(parseInt(form.quantity_precision, 10) || 0))
                  : 1
            }
            showDescription
            catalogEnabled={catalogEnabled}
            imageUrl={imageUrl}
            onImageChange={setImageFile}
            productId={id ? parseInt(id, 10) : null}
          />
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" loading={loading}>حفظ</Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/products')}>إلغاء</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
