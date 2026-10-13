import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { resolveCurrency, DEFAULT_CURRENCY } from './currencies'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const EN = 'en-GB'

export function formatNumber(value: string | number, decimals = 0) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return new Intl.NumberFormat(EN, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    numberingSystem: 'latn',
  }).format(num || 0)
}

export function formatMoney(value: string | number, currency = DEFAULT_CURRENCY) {
  const num = typeof value === 'string' ? parseFloat(value) : value
  const code = resolveCurrency(currency)
  // إجماليات/مدفوعات تظهر منزلتين؛ أسعار البيع قد تصل إلى 4 منازل عند الحاجة
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    numberingSystem: 'latn',
  }
  try {
    return new Intl.NumberFormat(EN, { ...opts, currency: code }).format(num || 0)
  } catch {
    return new Intl.NumberFormat(EN, { ...opts, currency: DEFAULT_CURRENCY }).format(num || 0)
  }
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat(EN, {
    dateStyle: 'medium',
    timeStyle: 'short',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).format(new Date(value))
}

export function formatDateShort(value: string) {
  return new Intl.DateTimeFormat(EN, {
    month: 'short',
    day: 'numeric',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).format(new Date(value))
}
