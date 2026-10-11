import { api } from '../api/client'
import type { Paginated, Product } from '../types'

export interface InventorySummary {
  inventory_cost_value: string
  inventory_sell_value: string
  total_products: number
}

async function fetchAllActiveProducts(): Promise<Product[]> {
  const products: Product[] = []
  let page = 1

  while (true) {
    const { data } = await api.get<Paginated<Product>>('/products/', {
      params: { page, is_active: 'true' },
    })
    products.push(...data.results.filter((p) => p.is_active))
    if (!data.next) break
    page += 1
  }

  return products
}

function sumInventory(products: Product[]): InventorySummary {
  let cost = 0
  let sell = 0

  for (const product of products) {
    const qty = product.quantity || 0
    cost += parseFloat(product.buy_price || '0') * qty
    sell += parseFloat(product.sell_price || '0') * qty
  }

  return {
    inventory_cost_value: cost.toFixed(2),
    inventory_sell_value: sell.toFixed(2),
    total_products: products.length,
  }
}

export async function loadInventorySummary(): Promise<InventorySummary> {
  try {
    const { data } = await api.get<InventorySummary>('/products/inventory-summary/')
    return data
  } catch {
    const products = await fetchAllActiveProducts()
    return sumInventory(products)
  }
}

export async function enrichDashboardInventory<T extends InventorySummary>(
  stats: T,
): Promise<T> {
  if (
    stats.inventory_cost_value != null &&
    stats.inventory_sell_value != null &&
    stats.total_products != null
  ) {
    return stats
  }
  const summary = await loadInventorySummary()
  return {
    ...stats,
    inventory_cost_value: summary.inventory_cost_value,
    inventory_sell_value: summary.inventory_sell_value,
    total_products: summary.total_products || stats.total_products,
  }
}
