/** Max fractional places for product quantities (matches backend MAX_PRECISION). */
export const MAX_QTY_PRECISION = 4

export function clampQtyPrecision(precision = 0): number {
  return Math.min(MAX_QTY_PRECISION, Math.max(0, Math.trunc(Number(precision) || 0)))
}

/** Step for quantity inputs from product precision (0–4). */
export function quantityStep(precision = 0): number {
  const p = clampQtyPrecision(precision)
  if (p <= 0) return 1
  if (p === 1) return 0.1
  if (p === 2) return 0.01
  if (p === 3) return 0.001
  return 0.0001
}

/**
 * Display quantity: integers for normal products, decimals only when fractional is enabled.
 */
export function formatQtyDisplay(
  value: number | string | null | undefined,
  opts?: { allowFractional?: boolean; precision?: number; unit?: string | null },
): string {
  const n = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'

  const allow = Boolean(opts?.allowFractional)
  let text: string
  if (!allow) {
    text = String(Math.round(n))
  } else {
    const precision = clampQtyPrecision(opts?.precision ?? 2)
    text = n.toFixed(precision).replace(/\.?0+$/, '')
    if (text === '-0') text = '0'
  }

  const unit = (opts?.unit || '').trim()
  return unit ? `${text} ${unit}` : text
}

export function roundQty(value: number, precision = 0): number {
  const p = clampQtyPrecision(precision)
  const factor = 10 ** p
  return Math.round(value * factor) / factor
}

export function parseQtyInput(
  raw: string,
  opts: { allowFractional: boolean; precision?: number; min?: number; max?: number },
): number | null {
  const { allowFractional, precision = 0, min = 0, max } = opts
  if (raw.trim() === '') return null
  const parsed = allowFractional ? parseFloat(raw) : parseInt(raw, 10)
  if (Number.isNaN(parsed)) return null
  let next = allowFractional ? roundQty(parsed, precision) : Math.round(parsed)
  if (min != null) next = Math.max(min, next)
  if (max != null) next = Math.min(max, next)
  return next
}
