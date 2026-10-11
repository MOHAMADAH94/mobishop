import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../api/client'
import { extractList } from '../lib/apiHelpers'
import type { Store, User } from '../types'

interface AuthState {
  user: User | null
  accessToken: string | null
  refreshToken: string | null
  stores: Store[]
  currentStoreId: number | null
  storeVersion: number
  setAuth: (user: User, access: string, refresh: string) => void
  setTokens: (access: string, refresh: string) => void
  setStores: (stores: Store[]) => void
  refreshStores: () => Promise<void>
  setCurrentStore: (id: number) => void
  logout: () => void
  currentStore: () => Store | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      stores: [],
      currentStoreId: null,
      storeVersion: 0,
      setAuth: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setStores: (stores) => {
        const current = get().currentStoreId
        const exists = current && stores.some((s) => s.id === current)
        const newStoreId = exists ? current : stores[0]?.id ?? null
        set({ stores, currentStoreId: newStoreId })
      },
      refreshStores: async () => {
        const { data } = await api.get<Store[] | { results: Store[] }>('/stores/')
        const stores = extractList(data)
        get().setStores(stores)
      },
      setCurrentStore: (id) =>
        set((state) => ({
          currentStoreId: id,
          storeVersion: state.storeVersion + 1,
        })),
      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          stores: [],
          currentStoreId: null,
          storeVersion: 0,
        }),
      currentStore: () => {
        const { stores, currentStoreId } = get()
        return stores.find((s) => s.id === currentStoreId) ?? null
      },
    }),
    {
      name: 'mobishop-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        currentStoreId: state.currentStoreId,
      }),
    },
  ),
)
