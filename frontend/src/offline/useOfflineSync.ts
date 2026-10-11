import { useCallback, useEffect, useState } from 'react'
import { countPendingOutbox } from './outbox'
import { getLastSyncError, isSyncing, refreshOfflineCaches, syncOutbox } from './sync'

export function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return online
}

export function useOfflineSync(storeId: number | null | undefined) {
  const online = useOnlineStatus()
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshPending = useCallback(async () => {
    if (!storeId) {
      setPending(0)
      return
    }
    setPending(await countPendingOutbox(storeId))
  }, [storeId])

  const runSync = useCallback(async () => {
    if (!storeId || !navigator.onLine) return
    setSyncing(true)
    try {
      const result = await syncOutbox(storeId)
      await refreshOfflineCaches(storeId)
      setError(getLastSyncError())
      return result
    } finally {
      setSyncing(isSyncing())
      await refreshPending()
      setSyncing(false)
    }
  }, [storeId, refreshPending])

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

  useEffect(() => {
    const onChange = () => void refreshPending()
    window.addEventListener('mobishop:outbox-changed', onChange)
    return () => window.removeEventListener('mobishop:outbox-changed', onChange)
  }, [refreshPending])

  useEffect(() => {
    if (!storeId || !online) return
    void runSync()
  }, [storeId, online, runSync])

  useEffect(() => {
    const onFocus = () => {
      if (storeId && navigator.onLine) void runSync()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [storeId, runSync])

  return { online, pending, syncing, error, runSync, refreshPending }
}
