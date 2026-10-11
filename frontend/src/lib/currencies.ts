export interface CurrencyOption {
  code: string
  label: string
}

export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'USD — دولار أمريكي' },
  { code: 'EUR', label: 'EUR — يورو' },
  { code: 'GBP', label: 'GBP — جنيه إسترليني' },
  { code: 'SAR', label: 'SAR — ريال سعودي' },
  { code: 'AED', label: 'AED — درهم إماراتي' },
  { code: 'KWD', label: 'KWD — دينار كويتي' },
  { code: 'QAR', label: 'QAR — ريال قطري' },
  { code: 'BHD', label: 'BHD — دينار بحريني' },
  { code: 'OMR', label: 'OMR — ريال عماني' },
  { code: 'EGP', label: 'EGP — جنيه مصري' },
  { code: 'JOD', label: 'JOD — دينار أردني' },
  { code: 'LBP', label: 'LBP — ليرة لبنانية' },
  { code: 'IQD', label: 'IQD — دينار عراقي' },
  { code: 'SYP', label: 'SYP — ليرة سورية' },
  { code: 'YER', label: 'YER — ريال يمني' },
  { code: 'MAD', label: 'MAD — درهم مغربي' },
  { code: 'TND', label: 'TND — دينار تونسي' },
  { code: 'DZD', label: 'DZD — دينار جزائري' },
  { code: 'LYD', label: 'LYD — دينار ليبي' },
  { code: 'SDG', label: 'SDG — جنيه سوداني' },
  { code: 'TRY', label: 'TRY — ليرة تركية' },
]

export const DEFAULT_CURRENCY = 'USD'

export const HARD_CURRENCY_CODES = new Set([
  'USD', 'EUR', 'GBP', 'CHF',
  'KWD', 'BHD', 'OMR', 'JOD',
  'SAR', 'AED', 'QAR',
])

export function isHardCurrency(code: string | undefined | null): boolean {
  return HARD_CURRENCY_CODES.has(normalizeCurrency(code))
}

/** True → label "1 {currency} = X {base}"; False → "1 {base} = X {currency}" */
export function usesCurrencyToBaseQuote(currencyCode: string, baseCurrency: string): boolean {
  const code = normalizeCurrency(currencyCode)
  const base = normalizeCurrency(baseCurrency)
  if (code === base) return true
  return isHardCurrency(code)
}

export function rateQuoteLabel(baseCurrency: string, currencyCode: string): string {
  const base = normalizeCurrency(baseCurrency)
  const code = normalizeCurrency(currencyCode)
  if (usesCurrencyToBaseQuote(code, base)) {
    return `1 ${code} = … ${base}`
  }
  return `1 ${base} = … ${code}`
}

/** Round monetary amounts to 2 decimal places. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function rateToBaseFromDisplay(
  baseCurrency: string,
  currencyCode: string,
  displayRate: number,
): number {
  if (displayRate <= 0) return 0
  if (usesCurrencyToBaseQuote(currencyCode, baseCurrency)) {
    return displayRate
  }
  return 1 / displayRate
}

export function displayRateFromInternal(
  baseCurrency: string,
  currencyCode: string,
  rateToBase: number,
): number {
  if (rateToBase <= 0) return 0
  if (usesCurrencyToBaseQuote(currencyCode, baseCurrency)) {
    return rateToBase
  }
  return 1 / rateToBase
}

export const ALLOWED_CURRENCY_CODES = new Set(CURRENCY_OPTIONS.map((c) => c.code))

export function normalizeCurrency(code: string | undefined | null): string {
  return (code || '').trim().toUpperCase()
}

export function isAllowedCurrency(code: string | undefined | null): boolean {
  return ALLOWED_CURRENCY_CODES.has(normalizeCurrency(code))
}

export function resolveCurrency(code: string | undefined | null): string {
  const normalized = normalizeCurrency(code)
  return isAllowedCurrency(normalized) ? normalized : DEFAULT_CURRENCY
}

export function currencyLabel(code: string): string {
  return CURRENCY_OPTIONS.find((c) => c.code === code)?.label ?? code
}

/** Build a map of currency code → rate_to_base from store currencies API response. */
export function buildRateMap(currencies: { code: string; rate_to_base: string }[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const row of currencies) {
    map.set(row.code, parseFloat(row.rate_to_base) || 1)
  }
  return map
}

/** Convert amount between currencies using store rates (1 unit = rate_to_base of base). */
export function convertAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  baseCurrency: string,
  rates: Map<string, number>,
): number {
  const from = normalizeCurrency(fromCode)
  const to = normalizeCurrency(toCode)
  const base = normalizeCurrency(baseCurrency)
  if (from === to) return roundMoney(amount)
  let inBase = amount
  if (from !== base) {
    const fromRate = rates.get(from) ?? 1
    inBase = amount * fromRate
  }
  if (to === base) return roundMoney(inBase)
  const toRate = rates.get(to) ?? 1
  return roundMoney(toRate > 0 ? inBase / toRate : amount)
}

