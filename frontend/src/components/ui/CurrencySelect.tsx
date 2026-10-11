import { CURRENCY_OPTIONS, resolveCurrency } from '../../lib/currencies'
import { Select } from './Select'

interface Props {
  label?: string
  value: string
  onChange: (code: string) => void
  className?: string
  required?: boolean
}

export function CurrencySelect({ label = 'العملة', value, onChange, className, required }: Props) {
  return (
    <Select
      label={label}
      value={resolveCurrency(value)}
      onChange={onChange}
      className={className}
      required={required}
      options={CURRENCY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))}
    />
  )
}
