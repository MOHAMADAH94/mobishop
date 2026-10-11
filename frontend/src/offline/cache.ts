import { api } from '../api/client'
import { extractList } from '../lib/apiHelpers'
import type { Customer, Product, Supplier } from '../types'
import { offlineDb, type CachedCustomer, type CachedProduct, type CachedSupplier } from './db'

function toCachedProduct(p: Product | CachedProduct, storeId: number): CachedProduct {
  const product = p as Product & CachedProduct
  const id = Number(p.id)
  const sid = Number(storeId)
  if (!Number.isFinite(id) || !Number.isFinite(sid)) {
    throw new Error('مفتاح كاش المنتج غير صالح (id/storeId).')
  }
  return {
    id,
    storeId: sid,
    name: p.name,
    sku: p.sku || '',
    barcode: p.barcode || '',
    imei: p.imei || '',
    sell_price: String(p.sell_price),
    buy_price: String(product.buy_price ?? '0'),
    quantity: Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : 0,
    low_stock_threshold: Number.isFinite(Number(p.low_stock_threshold))
      ? Number(p.low_stock_threshold)
      : 5,
    category: p.category ?? null,
    category_name: p.category_name || '',
    is_active: p.is_active !== false,
    is_low_stock: Boolean(p.is_low_stock),
    allow_fractional_quantity: Boolean(product.allow_fractional_quantity),
    quantity_precision: product.quantity_precision ?? 0,
    unit: product.unit || '',
    image_url: product.image_url ?? null,
  }
}

export async function refreshProductCache(storeId: number): Promise<number> {
  const { data } = await api.get<{ products: CachedProduct[] }>('/products/offline-cache/')
  const rows = (data.products || []).map((p) => toCachedProduct(p, storeId))
  await offlineDb.transaction('rw', offlineDb.products, offlineDb.meta, async () => {
    await offlineDb.products.where('storeId').equals(storeId).delete()
    if (rows.length) await offlineDb.products.bulkPut(rows)
    await offlineDb.meta.put({ key: `productsCachedAt:${storeId}`, value: new Date().toISOString() })
  })
  return rows.length
}

export async function refreshCustomerCache(storeId: number): Promise<number> {
  const { data } = await api.get<Customer[] | { results: Customer[] }>('/customers/')
  const list = extractList(data).filter((c) => c.is_active !== false)
  const rows: CachedCustomer[] = list.map((c) => ({
    id: c.id,
    storeId,
    name: c.name,
    phone: c.phone || '',
    debt: String(c.debt || '0'),
    is_active: c.is_active !== false,
  }))
  await offlineDb.transaction('rw', offlineDb.customers, offlineDb.meta, async () => {
    await offlineDb.customers.where('storeId').equals(storeId).delete()
    if (rows.length) await offlineDb.customers.bulkPut(rows)
    await offlineDb.meta.put({ key: `customersCachedAt:${storeId}`, value: new Date().toISOString() })
  })
  return rows.length
}

export async function refreshSupplierCache(storeId: number): Promise<number> {
  try {
    const { data } = await api.get<Supplier[] | { results: Supplier[] }>('/purchases/suppliers/')
    const list = extractList(data).filter((s) => s.is_active !== false)
    const rows: CachedSupplier[] = list.map((s) => ({
      id: s.id,
      storeId,
      name: s.name,
      phone: s.phone || '',
      balance: String(s.balance || '0'),
      is_active: s.is_active !== false,
    }))
    await offlineDb.transaction('rw', offlineDb.suppliers, offlineDb.meta, async () => {
      await offlineDb.suppliers.where('storeId').equals(storeId).delete()
      if (rows.length) await offlineDb.suppliers.bulkPut(rows)
      await offlineDb.meta.put({ key: `suppliersCachedAt:${storeId}`, value: new Date().toISOString() })
    })
    return rows.length
  } catch {
    return 0
  }
}

export async function searchCachedProducts(storeId: number, q: string): Promise<CachedProduct[]> {
  const term = q.trim().toLowerCase()
  if (!term) return []
  const all = await offlineDb.products.where('storeId').equals(storeId).toArray()
  return all
    .filter((p) => {
      return (
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        p.barcode.toLowerCase().includes(term) ||
        p.imei.toLowerCase().includes(term)
      )
    })
    .slice(0, 20)
}

export async function lookupCachedProduct(storeId: number, code: string): Promise<CachedProduct | null> {
  const raw = code.trim()
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  const all = await offlineDb.products.where('storeId').equals(storeId).toArray()
  const lower = raw.toLowerCase()
  return (
    all.find(
      (p) =>
        p.barcode.toLowerCase() === lower ||
        p.sku.toLowerCase() === lower ||
        p.imei.toLowerCase() === lower ||
        (digits && p.imei === digits),
    ) || null
  )
}

export async function getCachedCustomers(storeId: number): Promise<CachedCustomer[]> {
  return offlineDb.customers.where('storeId').equals(storeId).sortBy('name')
}

export async function getCachedProducts(storeId: number): Promise<CachedProduct[]> {
  return offlineDb.products.where('storeId').equals(storeId).toArray()
}

export async function getCachedSuppliers(storeId: number): Promise<CachedSupplier[]> {
  return offlineDb.suppliers.where('storeId').equals(storeId).sortBy('name')
}

export async function putCachedProduct(storeId: number, product: Product | CachedProduct) {
  const id = Number(product.id)
  if (!Number.isFinite(id) || !Number.isFinite(Number(storeId))) {
    // لا تكسر حفظ المنتج عبر الإنترنت إذا نقص id من الاستجابة
    console.warn('putCachedProduct skipped: invalid id/storeId', { storeId, id: product.id })
    return
  }
  await offlineDb.products.put(toCachedProduct(product, storeId))
}

export async function putCachedCustomer(storeId: number, c: CachedCustomer) {
  await offlineDb.customers.put({ ...c, storeId })
}

export async function adjustCachedProductQty(storeId: number, productId: number, delta: number) {
  const key: [number, number] = [storeId, productId]
  const row = await offlineDb.products.get(key)
  if (!row) return
  const next = Math.max(0, row.quantity + delta)
  await offlineDb.products.put({
    ...row,
    quantity: next,
    is_low_stock: next <= row.low_stock_threshold,
  })
}

export function cachedProductToProduct(p: CachedProduct): Product {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    imei: p.imei,
    sell_price: p.sell_price,
    buy_price: p.buy_price,
    quantity: Number.isFinite(Number(p.quantity)) ? Number(p.quantity) : 0,
    low_stock_threshold: Number.isFinite(Number(p.low_stock_threshold))
      ? Number(p.low_stock_threshold)
      : 5,
    category: p.category,
    category_name: p.category_name,
    is_active: p.is_active,
    is_low_stock: p.is_low_stock,
    allow_fractional_quantity: p.allow_fractional_quantity,
    quantity_precision: p.quantity_precision,
    unit: p.unit,
    image_url: p.image_url,
  }
}

export function nextTempId(): number {
  return -Math.floor(Date.now() % 1_000_000_000) - Math.floor(Math.random() * 1000)
}
