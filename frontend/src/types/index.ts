export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  phone: string
}

export interface Role {
  id: number
  code: 'owner' | 'manager' | 'cashier' | 'technician'
  name: string
  permissions?: string[]
}

export interface Subscription {
  status: 'trial' | 'active' | 'expired'
  trial_ends_at: string | null
  expires_at: string | null
}

export interface Store {
  id: number
  name: string
  business_type: string
  currency: string
  phone: string
  is_active: boolean
  created_at: string
  role: Role | null
  subscription: Subscription
  catalog_enabled?: boolean
  store_app_enabled?: boolean
  ai_assistant_enabled?: boolean
  settings?: StoreSettings
  address?: string
}

export interface StoreSettings {
  tax_rate: string
  low_stock_threshold: number
  invoice_footer: string
  invoice_prefix: string
}

export interface StoreCurrencyRow {
  code: string
  is_active: boolean
  is_base: boolean
  rate_to_base: string
  display_rate?: string
  rate_quote?: string
  updated_at: string | null
}

export interface StoreCurrenciesResponse {
  base_currency: string
  currencies: StoreCurrencyRow[]
}

export interface Category {
  id: number
  name: string
  description: string
  slug?: string | null
  show_in_catalog?: boolean
  featured?: boolean
  sort_order?: number
  image_url?: string | null
  products_count: number
  catalog_products_count?: number
}

export type SalePaymentMethod =
  | 'cash'
  | 'card'
  | 'bank_transfer'
  | 'e_wallet'
  | 'electronic'
  | 'other'

export type SaleHeaderPaymentMethod = SalePaymentMethod | 'partial'

export interface Product {
  id: number
  name: string
  sku: string
  barcode: string
  imei: string
  buy_price: string
  sell_price: string
  /** Can be fractional when allow_fractional_quantity is true */
  quantity: number
  low_stock_threshold: number
  is_low_stock: boolean
  category: number | null
  category_name: string
  is_active: boolean
  description?: string
  image_url?: string | null
  publish_in_catalog?: boolean
  is_catalog_offer?: boolean
  allow_fractional_quantity?: boolean
  quantity_precision?: number
  unit?: string
}

export interface SalePaymentInput {
  method: SalePaymentMethod
  amount: number
}

export interface CashboxPaymentMethodRow {
  method: string
  label: string
  total: string
}

export interface CustomerDebtReference {
  type: 'sale' | 'repair'
  reference: string
  amount_due: string
  amount_due_original?: string
  currency?: string
  id: number
  date: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  email: string
  address?: string
  notes?: string
  debt: string
  is_active: boolean
  sales_count?: number
  debt_references?: CustomerDebtReference[]
  recent_sales?: Sale[]
}

export interface Supplier {
  id: number
  name: string
  phone: string
  email: string
  address?: string
  notes?: string
  balance: string
  is_active: boolean
  purchases_count?: number
  recent_purchases?: Purchase[]
}

export interface PurchasePayment {
  id: number
  amount: string
  method: string
  notes: string
  created_at: string
}

export interface PurchaseItem {
  id: number
  product: number | null
  product_name: string
  sku: string
  quantity: number
  unit_cost: string
  line_total: string
}

export interface Purchase {
  id: number
  invoice_number: string
  supplier: number | null
  supplier_name: string
  status: string
  payment_method: string
  subtotal?: string
  discount?: string
  tax_amount?: string
  total: string
  currency?: string
  exchange_rate_to_base?: string
  amount_paid: string
  amount_due?: string
  notes?: string
  created_by_name: string
  created_at: string
  items?: PurchaseItem[]
  payments?: PurchasePayment[]
}

export interface Expense {
  id: number
  title: string
  amount: string
  currency?: string
  exchange_rate_to_base?: string
  category: string
  category_label: string
  payment_method: string
  payment_method_label: string
  expense_date: string
  notes: string
  is_active: boolean
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface SalePayment {
  id: number
  amount: string
  method: string
  notes: string
  created_at: string
}

export interface SaleItem {
  id: number
  product: number | null
  product_name: string
  sku: string
  imei?: string
  quantity: number
  quantity_returned: number
  quantity_available_to_return: number
  unit_price: string
  line_total: string
  discount?: string
}

export interface SaleReturnRecord {
  id: number
  return_number: string
  refund_amount: string
  notes: string
  created_at: string
  items: { id: number; product_name: string; quantity: number; refund_amount: string }[]
}

export interface Sale {
  id: number
  invoice_number: string
  customer: number | null
  customer_name: string
  status: string
  payment_method: SaleHeaderPaymentMethod | string
  currency?: string
  exchange_rate_to_base?: string
  subtotal?: string
  discount?: string
  tax_amount?: string
  total: string
  total_returned?: string
  net_total?: string
  amount_paid: string
  amount_due?: string
  notes?: string
  created_by_name: string
  created_at: string
  items?: SaleItem[]
  returns?: SaleReturnRecord[]
  payments?: SalePayment[]
}

export interface RepairPayment {
  id: number
  amount: string
  method: string
  notes: string
  created_at: string
}

export interface RepairOrder {
  id: number
  ticket_number: string
  customer: number | null
  customer_name: string
  customer_phone: string
  customer_display: string
  device_brand: string
  device_model: string
  imei: string
  issue_description: string
  diagnosis: string
  status: string
  status_display: string
  currency?: string
  exchange_rate_to_base?: string
  labor_cost: string
  parts_cost: string
  total_cost: string
  deposit_paid: string
  amount_due?: string
  debt_posted?: boolean
  payments?: RepairPayment[]
  assigned_to: number | null
  assigned_to_name: string
  received_at: string
  estimated_delivery: string | null
  completed_at: string | null
  notes: string
  created_at: string
}

export interface ProductStatRow {
  product_id: number | null
  name: string
  quantity_sold: number
  revenue: string
  profit: string
  margin_percent: string
}

export interface ProductStatsResponse {
  date_from: string
  date_to: string
  sort: 'quantity' | 'revenue' | 'profit'
  limit: number
  summary: {
    products_count: number
    total_quantity_sold: number
    total_revenue: string
    total_profit: string
  }
  products: ProductStatRow[]
}

export interface DashboardStats {
  base_currency?: string
  selected_day?: string
  selected_month?: string
  today_sales: string
  month_sales: string
  today_repairs: string
  month_repairs: string
  month_deposits: string
  today_total: string
  month_total: string
  today_profit: string
  month_profit: string
  today_expenses: string
  month_expenses: string
  today_net_profit: string
  month_net_profit: string
  total_customer_debt: string
  open_repairs_count: number
  open_repairs_value: string
  today_invoices: number
  month_invoices: number
  low_stock_count: number
  total_products: number
  inventory_cost_value: string
  inventory_sell_value: string
  top_products: { name: string; quantity: number }[]
  daily_sales: {
    date: string
    sales_total: string
    repairs_total: string
    expenses_total?: string
    total: string
    count: number
  }[]
}

export interface BusinessRecommendation {
  id: number
  severity: 'info' | 'warning' | 'critical'
  severity_display: string
  kind: 'alert' | 'recommendation' | 'opportunity'
  kind_display: string
  category: string
  category_display: string
  title: string
  reason: string
  suggested_action: string
  entity_type: string
  entity_id: number | null
  entity_name: string
  is_dismissed: boolean
  generated_at: string
}

export interface DecisionCenterSummary {
  total_active: number
  critical_count: number
  opportunities_count: number
  warning_count: number
  info_count: number
  last_generated_at: string | null
}

export interface ProfitPeriod {
  period: string
  date_from: string
  date_to: string
  revenue: string
  product_cost: string
  gross_profit: string
  expenses: string
  net_profit: string
}

export interface ProfitDashboard {
  base_currency: string
  today: ProfitPeriod
  week: ProfitPeriod
  month: ProfitPeriod
  year: ProfitPeriod
}

export interface ProfitBreakdownSegment {
  key: string
  label: string
  revenue: string
  cost: string
  profit: string
}

export interface ProfitBreakdown {
  period: string
  date_from: string
  date_to: string
  segments: ProfitBreakdownSegment[]
}

export interface ProfitTrendPoint {
  date: string
  revenue: string
  gross_profit: string
  expenses: string
  net_profit: string
}

export interface ProfitTrends {
  days: number
  trends: ProfitTrendPoint[]
}

export interface ProfitProductRow {
  product_id: number | null
  name: string
  quantity_sold: number
  revenue: string
  cost: string
  gross_profit: string
  margin_percent: string
}

export interface ProfitCategoryRow {
  category_id: number | null
  name: string
  revenue: string
  cost: string
  profit: string
  margin_percent: string
}

export interface ProfitEmployeeRow {
  user_id: number | null
  name: string
  sales_count: number
  revenue: string
  profit: string
  margin_percent: string
}

export interface ProfitSupplierRow {
  supplier_id: number
  name: string
  purchase_total: string
  items_purchased: number
  avg_unit_cost: string
  related_sales_profit: string
}

export interface ChatResponse {
  session_id: number
  answer: string
  statistics: Record<string, unknown>
  recommendation: string | null
  message_id: number
  can_escalate?: boolean
  category?: string
}

export interface AssistantQuickAction {
  id: string
  label: string
  message: string
}

export interface AssistantSuggestedResponse {
  welcome?: string
  welcome_message?: string
  questions?: string[]
  suggested_questions?: string[]
  quick_actions?: AssistantQuickAction[]
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface StoreCatalogProfile {
  catalog_enabled: boolean
  is_public: boolean
  slug: string | null
  catalog_logo_url: string | null
  banner_url: string | null
  store_logo_url: string | null
  description: string
  contact_phone: string
  whatsapp: string
  telegram: string
  address: string
  latitude: string | number | null
  longitude: string | number | null
  show_prices: boolean
  show_out_of_stock: boolean
  public_url: string | null
  updated_at: string
}

export interface PublicCatalogStore {
  name: string
  slug: string
  description: string
  logo_url: string | null
  banner_url: string | null
  contact_phone: string
  whatsapp: string
  telegram: string
  address: string
  latitude: number | null
  longitude: number | null
  currency: string
  show_prices: boolean
}

export interface PublicCatalogProduct {
  id: number
  catalog_slug?: string
  name: string
  description: string
  image_url: string | null
  category_name: string
  category_slug: string
  sell_price: string | null
  in_stock: boolean
  is_offer: boolean
}

export interface PublicCatalogCategory {
  id: number
  name: string
  slug: string
  description: string
  image_url: string | null
  featured: boolean
  products_count: number
}

export interface MarketplaceStoreCard {
  name: string
  slug: string
  description: string
  logo_url: string | null
  banner_url: string | null
  products_count: number
  featured: boolean
  joined_at: string
  contact_phone: string
  whatsapp: string
  telegram: string
}

export interface MarketplaceProduct {
  id: number
  catalog_slug: string
  name: string
  description: string
  image_url: string | null
  category_name: string
  category_slug: string
  sell_price: string | null
  in_stock: boolean
  is_offer: boolean
  store_name: string
  store_slug: string
  store_logo_url: string | null
}

export interface MarketplaceAnalytics {
  store_views: number
  product_views: number
  top_products: {
    id: number
    name: string
    catalog_slug: string | null
    views: number
  }[]
}

export interface StoreAppBuild {
  id: number
  app_name: string
  app_icon: string | null
  store_url: string
  primary_color: string
  package_name: string
  version_name: string
  version_code: number
  status: 'pending' | 'building' | 'completed' | 'failed' | 'cancelled'
  status_label?: string
  is_installable?: boolean
  error_message: string
  download_url: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface StoreAppStatus {
  feature_enabled: boolean
  can_generate: boolean
  message: string
  store_name: string
  store_url: string | null
  default_app_name: string
  default_color: string
  catalog_slug: string | null
  latest_build: StoreAppBuild | null
}
