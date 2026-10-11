/** Step for quantity inputs from product precision (0–3). */
export function quantityStep(precision = 0): number {
  if (precision <= 0) return 1
  if (precision === 1) return 0.1
  if (precision === 2) return 0.01
  return 0.001
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
    const precision = Math.min(3, Math.max(0, opts?.precision ?? 2))
    text = n.toFixed(precision).replace(/\.?0+$/, '')
    if (text === '-0') text = '0'
  }

  const unit = (opts?.unit || '').trim()
  return unit ? `${text} ${unit}` : text
}

export function roundQty(value: number, precision = 0): number {
  const p = Math.min(3, Math.max(0, precision))
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
