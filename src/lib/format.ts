const NNBSP = ' '

/** 48420 → «48 420». Знак минуса — типографский. */
export function money(value: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(Math.round(value))
  const digits = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)
  if (value < 0) return `−${digits}`
  if (opts.sign && value > 0) return `+${digits}`
  return digits
}

const WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']

export function dayStamp(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${WEEKDAYS[date.getDay()]} ${dd}.${mm}`
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}
