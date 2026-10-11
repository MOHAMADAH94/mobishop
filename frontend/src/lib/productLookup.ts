import axios from 'axios'
import { api } from '../api/client'
import type { Product } from '../types'

/** Trim spaces — barcodes / SKUs */
export function normalizeScanCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '')
}

/** IMEI: digits only (14–17 typical) */
export function normalizeImei(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 14) return digits
  return normalizeScanCode(raw)
}

export function normalizeLookupCode(raw: string, field?: 'imei' | 'barcode'): string {
  if (field === 'imei') return normalizeImei(raw)
  const code = normalizeScanCode(raw)
  if (field === 'barcode') return code
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 14 && digits.length <= 17) return digits
  return code
}

/** @deprecated use normalizeScanCode */
export const normalizeBarcode = normalizeScanCode

export async function lookupProductByCode(
  code: string,
  field?: 'imei' | 'barcode',
): Promise<Product | null> {
  const normalized = normalizeLookupCode(code, field)
  if (!normalized) return null

  try {
    const { data } = await api.get<Product>('/products/lookup/', { params: { code: normalized } })
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}
