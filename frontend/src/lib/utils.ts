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
  try {
    return new Intl.NumberFormat(EN, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      numberingSystem: 'latn',
    }).format(num || 0)
  } catch {
    return new Intl.NumberFormat(EN, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
      minimumFractionDigits: 2,
      numberingSystem: 'latn',
    }).format(num || 0)
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
