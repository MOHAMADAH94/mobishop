import { useEffect } from 'react'
import { api } from '../api/client'
import { extractList } from '../lib/apiHelpers'
import { useAuthStore } from '../stores/authStore'
import { useThemeStore } from '../stores/themeStore'
import type { Store } from '../types'

export function useAppInit() {
  const { accessToken, setStores } = useAuthStore()
  const setTheme = useThemeStore((s) => s.setTheme)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    setTheme(theme)
  }, [])

  useEffect(() => {
    if (!accessToken) return

    const syncStores = () => {
      api
        .get<Store[] | { results: Store[] }>('/stores/')
        .then(({ data }) => {
          const stores = extractList(data)
          setStores(stores)
          if (stores.length > 0 && !useAuthStore.getState().currentStoreId) {
            useAuthStore.getState().setCurrentStore(stores[0].id)
          }
        })
        .catch(() => {})
    }

    if (useAuthStore.persist.hasHydrated()) {
      syncStores()
      return
    }

    return useAuthStore.persist.onFinishHydration(() => {
      syncStores()
    })
  }, [accessToken, setStores])
}
