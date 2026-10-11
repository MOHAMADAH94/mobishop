import { api } from '../api/client'
import {
  adjustCachedProductQty,
  refreshCustomerCache,
  refreshProductCache,
  refreshSupplierCache,
} from './cache'
import { offlineDb, type OutboxEntry } from './db'
import {
  clearDoneOutbox,
  listPendingOutbox,
  markOutboxDone,
  markOutboxFailed,
  markOutboxSyncing,
  remapTempProductIds,
} from './outbox'

let syncing = false
let lastSyncError: string | null = null

export function getLastSyncError() {
  return lastSyncError
}

export function isSyncing() {
  return syncing
}

function extractError(err: unknown): { status?: number; detail: string } {
  const axiosErr = err as {
    response?: { status?: number; data?: unknown }
    message?: string
  }
  const status = axiosErr.response?.status
  const data = axiosErr.response?.data
  let detail = axiosErr.message || 'فشل المزامنة'
  if (typeof data === 'string') detail = data
  else if (data && typeof data === 'object') {
    const obj = data as { detail?: unknown }
    if (obj.detail != null) detail = String(obj.detail)
    else detail = JSON.stringify(data)
  }
  return { status, detail: String(detail) }
}

function resolveServerMeta(operation: OutboxEntry['operation'], data: Record<string, unknown>) {
  const id = typeof data.id === 'number' ? data.id : null
  const ref =
    (typeof data.invoice_number === 'string' && data.invoice_number) ||
    (typeof data.ticket_number === 'string' && data.ticket_number) ||
    (typeof data.name === 'string' && data.name) ||
    (typeof data.title === 'string' && data.title) ||
    null
  return { id, ref, operation }
}

async function dispatchEntry(entry: OutboxEntry): Promise<{ id: number | null; ref: string | null }> {
  const body = {
    ...entry.payload,
    client_request_id: entry.clientRequestId,
  }

  if (entry.method === 'PATCH') {
    const { data } = await api.patch<Record<string, unknown>>(entry.path, body)
    return resolveServerMeta(entry.operation, data)
  }

  const { data } = await api.post<Record<string, unknown>>(entry.path, body)
  const meta = resolveServerMeta(entry.operation, data)

  if (entry.operation === 'product.create' && entry.localTempId != null && meta.id != null) {
    await remapTempProductIds(entry.storeId, entry.localTempId, meta.id)
  }
  if (entry.operation === 'customer.create' && entry.localTempId != null && meta.id != null) {
    const cached = await offlineDb.customers.get([entry.storeId, entry.localTempId])
    if (cached) {
      await offlineDb.customers.delete([entry.storeId, entry.localTempId])
      await offlineDb.customers.put({ ...cached, id: meta.id })
    }
  }

  return meta
}

function depsReady(entry: OutboxEntry, doneIds: Set<string>, all: OutboxEntry[]): boolean {
  if (!entry.dependsOn?.length) return true
  return entry.dependsOn.every((dep) => {
    if (doneIds.has(dep)) return true
    const row = all.find((r) => r.clientRequestId === dep)
    return row?.status === 'done'
  })
}

export async function syncOutbox(storeId?: number): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { synced: 0, failed: 0 }
  }

  syncing = true
  lastSyncError = null
  let synced = 0
  let failed = 0
  const doneIds = new Set<string>()

  try {
    // Mark previously done in DB
    const allDone = await offlineDb.outbox.where('status').equals('done').toArray()
    for (const d of allDone) doneIds.add(d.clientRequestId)

    const pending = await listPendingOutbox(storeId)
    // Prefer dependency order: products before purchases
    const ordered = [...pending].sort((a, b) => {
      const score = (op: string) =>
        op.startsWith('product.') ? 0 : op.startsWith('customer.') ? 1 : op.startsWith('purchase.') ? 2 : 3
      return score(a.operation) - score(b.operation) || a.createdAt.localeCompare(b.createdAt)
    })

    for (const entry of ordered) {
      if (!entry.id || entry.status === 'done') continue
      if (!depsReady(entry, doneIds, pending)) continue

      try {
        await markOutboxSyncing(entry.id)
        const meta = await dispatchEntry(entry)
        await markOutboxDone(entry.id, meta.id, meta.ref)
        doneIds.add(entry.clientRequestId)
        synced += 1
      } catch (err: unknown) {
        const { status, detail } = extractError(err)
        if (!status || status >= 500) {
          await offlineDb.outbox.update(entry.id, {
            status: 'pending',
            attempts: (entry.attempts || 0) + 1,
            lastError: detail,
          })
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('mobishop:outbox-changed'))
          }
          lastSyncError = 'تعذّر الاتصال — ستُعاد المحاولة لاحقاً'
          failed += 1
          break
        }
        await markOutboxFailed(entry.id, detail)
        lastSyncError = detail
        failed += 1
      }
    }
    await clearDoneOutbox()
  } finally {
    syncing = false
  }

  return { synced, failed }
}

export async function refreshOfflineCaches(storeId: number): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  await Promise.all([
    refreshProductCache(storeId),
    refreshCustomerCache(storeId),
    refreshSupplierCache(storeId),
  ])
}

export async function applyLocalSaleQty(
  storeId: number,
  items: { product_id: number; quantity: number }[],
) {
  for (const item of items) {
    await adjustCachedProductQty(storeId, item.product_id, -item.quantity)
  }
}

export async function applyLocalPurchaseQty(
  storeId: number,
  items: { product_id: number; quantity: number }[],
) {
  for (const item of items) {
    await adjustCachedProductQty(storeId, item.product_id, item.quantity)
  }
}
