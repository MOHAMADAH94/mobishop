import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { Toasts } from './components/layout/Toasts'
import { ProtectedRoute, GuestRoute } from './components/ProtectedRoute'
import { useAppInit } from './hooks/useAppInit'
import { useAuthStore } from './stores/authStore'
import { api } from './api/client'
import { LoginPage } from './pages/auth/LoginPage'
import { RegisterPage } from './pages/auth/RegisterPage'
import { CreateStorePage } from './pages/stores/CreateStorePage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { ProductsPage } from './pages/products/ProductsPage'
import { ProductFormPage } from './pages/products/ProductFormPage'
import { BarcodePrintPage } from './pages/products/BarcodePrintPage'
import { CategoriesPage } from './pages/products/CategoriesPage'
import { InventoryPage } from './pages/inventory/InventoryPage'
import { POSPage } from './pages/pos/POSPage'
import { SalesPage } from './pages/sales/SalesPage'
import { CustomersPage } from './pages/customers/CustomersPage'
import { TeamPage } from './pages/team/TeamPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { RepairsPage } from './pages/repairs/RepairsPage'
import { ExpensesPage } from './pages/expenses/ExpensesPage'
import { CashboxPage } from './pages/cashbox/CashboxPage'
import { SuppliersPage } from './pages/suppliers/SuppliersPage'
import { PurchaseIntakePage } from './pages/purchases/PurchaseIntakePage'
import { PurchasesPage } from './pages/purchases/PurchasesPage'
import { SmartBusinessLayout, SmartBusinessIndexRedirect } from './pages/intelligence/SmartBusinessLayout'
import { DecisionCenterPage } from './pages/intelligence/DecisionCenterPage'
import { ProfitIntelligencePage } from './pages/intelligence/ProfitIntelligencePage'
import { AssistantPage } from './pages/assistant/AssistantPage'
import { CatalogSettingsPage } from './pages/catalog/CatalogSettingsPage'
import { StoreAppPage } from './pages/storeApp/StoreAppPage'
import { PublicShopPage } from './pages/catalog/public/PublicShopPage'
import { PublicAllProductsPage } from './pages/catalog/public/PublicAllProductsPage'
import { PublicCategoryPage } from './pages/catalog/public/PublicCategoryPage'
import { PublicProductPage } from './pages/catalog/public/PublicProductPage'
import { PublicOffersPage } from './pages/catalog/public/PublicOffersPage'
import { MarketplaceHomePage } from './pages/marketplace/MarketplaceHomePage'
import { MarketplaceStoresPage } from './pages/marketplace/MarketplaceStoresPage'
import { MarketplaceProductsPage } from './pages/marketplace/MarketplaceProductsPage'
import { MarketplaceOffersPage } from './pages/marketplace/MarketplaceOffersPage'
import { MarketplaceProductPage } from './pages/marketplace/MarketplaceProductPage'
import { extractList } from './lib/apiHelpers'
import type { Store } from './types'

function StoreGuard({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const stores = useAuthStore((s) => s.stores)
  const setStores = useAuthStore((s) => s.setStores)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!accessToken) return

    const loadStores = () => {
      api
        .get<Store[] | { results: Store[] }>('/stores/')
        .then(({ data }) => {
          setStores(extractList(data))
        })
        .finally(() => setReady(true))
    }

    if (useAuthStore.persist.hasHydrated()) {
      loadStores()
      return
    }

    return useAuthStore.persist.onFinishHydration(() => {
      loadStores()
    })
  }, [accessToken, setStores])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--primary)]/30 border-t-[var(--primary)]" />
      </div>
    )
  }

  if (stores.length === 0) return <Navigate to="/create-store" replace />
  return <>{children}</>
}

export default function App() {
  useAppInit()

  return (
    <BrowserRouter>
      <Toasts />
      <Routes>
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route path="/create-store" element={<CreateStorePage />} />
          <Route
            element={
              <StoreGuard>
                <AppLayout />
              </StoreGuard>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/smart-business" element={<SmartBusinessLayout />}>
              <Route index element={<SmartBusinessIndexRedirect />} />
              <Route path="decision-center" element={<DecisionCenterPage />} />
              <Route path="profit-intelligence" element={<ProfitIntelligencePage />} />
              <Route path="assistant" element={<AssistantPage />} />
            </Route>
            <Route path="/decision-center" element={<Navigate to="/smart-business/decision-center" replace />} />
            <Route path="/profit-intelligence" element={<Navigate to="/smart-business/profit-intelligence" replace />} />
            <Route path="/assistant" element={<Navigate to="/smart-business/assistant" replace />} />
            <Route path="/pos" element={<POSPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/barcode-print" element={<BarcodePrintPage />} />
            <Route path="/products/:id/edit" element={<ProductFormPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/sales" element={<SalesPage />} />
            <Route path="/repairs" element={<RepairsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/cashbox" element={<CashboxPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/suppliers" element={<SuppliersPage />} />
            <Route path="/purchase-intake" element={<PurchaseIntakePage />} />
            <Route path="/purchases" element={<PurchasesPage />} />
            <Route path="/team" element={<TeamPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/catalog/settings" element={<CatalogSettingsPage />} />
            <Route path="/store-app" element={<StoreAppPage />} />
          </Route>
        </Route>
        <Route path="/marketplace" element={<MarketplaceHomePage />} />
        <Route path="/marketplace/stores" element={<MarketplaceStoresPage />} />
        <Route path="/marketplace/products" element={<MarketplaceProductsPage />} />
        <Route path="/marketplace/offers" element={<MarketplaceOffersPage />} />
        <Route path="/product/:productSlug" element={<MarketplaceProductPage />} />
        <Route path="/shop/:slug" element={<PublicShopPage />} />
        <Route path="/shop/:slug/products" element={<PublicAllProductsPage />} />
        <Route path="/shop/:slug/category/:categorySlug" element={<PublicCategoryPage />} />
        <Route path="/shop/:slug/product/:productId" element={<PublicProductPage />} />
        <Route path="/shop/:slug/offers" element={<PublicOffersPage />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
