import { offlineDb, type OutboxEntry, type OutboxOperation, type OutboxSalePayload } from './db'

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function notify() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('mobishop:outbox-changed'))
  }
}

export function newClientRequestId() {
  return uuid().slice(0, 64)
}

export async function enqueueOperation(input: {
  storeId: number
  operation: OutboxOperation
  method: 'POST' | 'PATCH'
  path: string
  payload: Record<string, unknown>
  localLabel: string
  clientRequestId?: string
  dependsOn?: string[]
  localTempId?: number | null
}): Promise<OutboxEntry> {
  const idKey = (input.clientRequestId || uuid()).slice(0, 64)
  const existing = await offlineDb.outbox.where('clientRequestId').equals(idKey).first()
  if (existing) return existing

  const entry: OutboxEntry = {
    operation: input.operation,
    clientRequestId: idKey,
    storeId: input.storeId,
    createdAt: new Date().toISOString(),
    status: 'pending',
    attempts: 0,
    lastError: null,
    localLabel: input.localLabel,
    method: input.method,
    path: input.path,
    payload: input.payload,
    dependsOn: input.dependsOn || [],
    serverId: null,
    serverRef: null,
    localTempId: input.localTempId ?? null,
  }
  const id = await offlineDb.outbox.add(entry)
  notify()
  return { ...entry, id }
}

/** Back-compat for POS */
export async function enqueueSale(
  storeId: number,
  payload: OutboxSalePayload,
  clientRequestId?: string,
) {
  return enqueueOperation({
    storeId,
    operation: 'sale.create',
    method: 'POST',
    path: '/sales/create/',
    payload: payload as unknown as Record<string, unknown>,
    localLabel: `OFF-${(clientRequestId || uuid()).slice(0, 8).toUpperCase()}`,
    clientRequestId,
  })
}

export async function listPendingOutbox(storeId?: number): Promise<OutboxEntry[]> {
  let rows = await offlineDb.outbox
    .where('status')
    .anyOf(['pending', 'failed', 'syncing'])
    .toArray()
  if (storeId != null) rows = rows.filter((r) => r.storeId === storeId)
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function countPendingOutbox(storeId?: number): Promise<number> {
  const rows = await listPendingOutbox(storeId)
  return rows.filter((r) => r.status === 'pending' || r.status === 'failed').length
}

export async function markOutboxSyncing(id: number) {
  await offlineDb.outbox.update(id, { status: 'syncing' })
}

export async function markOutboxDone(
  id: number,
  serverId: number | null,
  serverRef: string | null,
) {
  await offlineDb.outbox.update(id, {
    status: 'done',
    serverId,
    serverRef,
    lastError: null,
  })
  notify()
}

export async function markOutboxFailed(id: number, error: string) {
  const row = await offlineDb.outbox.get(id)
  await offlineDb.outbox.update(id, {
    status: 'failed',
    attempts: (row?.attempts || 0) + 1,
    lastError: error,
  })
  notify()
}

export async function clearDoneOutbox(olderThanDays = 7) {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const done = await offlineDb.outbox.where('status').equals('done').toArray()
  const old = done.filter((r) => new Date(r.createdAt).getTime() < cutoff)
  await offlineDb.outbox.bulkDelete(old.map((r) => r.id!).filter(Boolean))
}

export async function remapTempProductIds(storeId: number, tempId: number, serverId: number) {
  const pending = await listPendingOutbox(storeId)
  for (const row of pending) {
    if (!row.id) continue
    let changed = false
    const payload = { ...row.payload }
    if (Array.isArray(payload.items)) {
      payload.items = (payload.items as { product_id: number }[]).map((it) => {
        if (it.product_id === tempId) {
          changed = true
          return { ...it, product_id: serverId }
        }
        return it
      })
    }
    let path = row.path
    if (path.includes(`/products/${tempId}/`)) {
      path = path.replace(`/products/${tempId}/`, `/products/${serverId}/`)
      changed = true
    }
    if (changed) {
      await offlineDb.outbox.update(row.id, { payload, path })
    }
  }
  // Also update product cache key
  const cached = await offlineDb.products.get([storeId, tempId])
  if (cached) {
    await offlineDb.products.delete([storeId, tempId])
    await offlineDb.products.put({ ...cached, id: serverId })
  }
}
