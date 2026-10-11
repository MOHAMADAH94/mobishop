export function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthRange(month: string, capToToday = true): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const from = `${month}-01`
  const lastDay = new Date(y, m, 0).getDate()
  let to = `${month}-${String(lastDay).padStart(2, '0')}`
  if (capToToday && month === currentMonthStr()) {
    to = localDateStr()
  }
  return { from, to }
}

export function formatMonthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('ar', {
    month: 'long',
    year: 'numeric',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).format(new Date(y, m - 1, 1))
}

export function formatDayLabel(day: string) {
  return new Intl.DateTimeFormat('ar', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    calendar: 'gregory',
    numberingSystem: 'latn',
  }).format(new Date(`${day}T12:00:00`))
}
