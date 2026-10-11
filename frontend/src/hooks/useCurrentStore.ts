import { useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'

/** Re-renders when the active store id changes. */
export function useCurrentStoreId() {
  return useAuthStore((s) => s.currentStoreId)
}

/** Bumps on every store switch — use in useEffect deps to reload data. */
export function useStoreVersion() {
  return useAuthStore((s) => s.storeVersion)
}

export function useCurrentStore() {
  const storeId = useCurrentStoreId()
  const stores = useAuthStore((s) => s.stores)
  return useMemo(
    () => stores.find((s) => s.id === storeId) ?? null,
    [stores, storeId],
  )
}
