import Dexie, { type Table } from 'dexie'

export type OutboxStatus = 'pending' | 'syncing' | 'done' | 'failed'

export type OutboxOperation =
  | 'sale.create'
  | 'purchase.create'
  | 'repair.create'
  | 'repair.patch'
  | 'expense.create'
  | 'customer.create'
  | 'product.create'
  | 'inventory.adjust'

export interface CachedProduct {
  id: number
  storeId: number
  name: string
  sku: string
  barcode: string
  imei: string
  sell_price: string
  buy_price: string
  quantity: number
  low_stock_threshold: number
  category: number | null
  category_name: string
  is_active: boolean
  is_low_stock: boolean
  allow_fractional_quantity?: boolean
  quantity_precision?: number
  unit?: string
  image_url?: string | null
}

export interface CachedCustomer {
  id: number
  storeId: number
  name: string
  phone: string
  debt: string
  is_active: boolean
}

export interface CachedSupplier {
  id: number
  storeId: number
  name: string
  phone: string
  balance: string
  is_active: boolean
}

/** @deprecated kept for POS typing convenience */
export interface OutboxSalePayload {
  customer_id: number | null
  payment_method: string
  currency: string
  discount: number
  amount_paid: number
  display_exchange_rate?: number
  payments?: { method: string; amount: number }[]
  items: { product_id: number; quantity: number; unit_price: number }[]
  notes?: string
}

export interface OutboxEntry {
  id?: number
  operation: OutboxOperation
  clientRequestId: string
  storeId: number
  createdAt: string
  status: OutboxStatus
  attempts: number
  lastError: string | null
  localLabel: string
  method: 'POST' | 'PATCH'
  path: string
  payload: Record<string, unknown>
  dependsOn: string[]
  serverId: number | null
  serverRef: string | null
  localTempId?: number | null
}

/** Legacy sale-shaped row (v1) — upgraded on open */
export type OutboxSale = OutboxEntry & { payload: OutboxSalePayload; localInvoiceNumber?: string }

export interface PosCartState {
  storeId: number
  cartJson: string
  customerId: string
  paymentMethod: string
  paymentCurrency: string
  discount: string
  amountPaid: string
  exchangeRateOverride: string
  updatedAt: string
}

export interface MetaRow {
  key: string
  value: string
}

class MobishopOfflineDB extends Dexie {
  products!: Table<CachedProduct, [number, number]>
  customers!: Table<CachedCustomer, [number, number]>
  suppliers!: Table<CachedSupplier, [number, number]>
  outbox!: Table<OutboxEntry, number>
  posCart!: Table<PosCartState, number>
  meta!: Table<MetaRow, string>

  constructor() {
    super('mobishop-offline')
    this.version(1).stores({
      products: '[storeId+id], storeId, name, sku, barcode, imei',
      customers: '[storeId+id], storeId, name, phone',
      outbox: '++id, clientRequestId, storeId, status, createdAt',
      posCart: 'storeId',
      meta: 'key',
    })
    this.version(2)
      .stores({
        products: '[storeId+id], storeId, name, sku, barcode, imei',
        customers: '[storeId+id], storeId, name, phone',
        suppliers: '[storeId+id], storeId, name',
        outbox: '++id, clientRequestId, storeId, status, createdAt, operation',
        posCart: 'storeId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        const rows = await tx.table('outbox').toArray()
        for (const row of rows) {
          if (row.operation) continue
          await tx.table('outbox').update(row.id, {
            operation: 'sale.create',
            method: 'POST',
            path: '/sales/create/',
            localLabel: row.localInvoiceNumber || `OFF-${String(row.clientRequestId || '').slice(0, 8)}`,
            dependsOn: [],
            serverId: row.serverSaleId ?? null,
            serverRef: row.serverInvoiceNumber ?? null,
            payload: row.payload || {},
          })
        }
      })
  }
}

export const offlineDb = new MobishopOfflineDB()
