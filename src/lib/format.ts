const NNBSP = ' '

/** Копейки → «48 420». Знак минуса — типографский. */
export function money(kopecks: number, opts: { sign?: boolean } = {}): string {
  const value = Math.round(kopecks / 100)
  const digits = String(Math.abs(value)).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP)
  if (value < 0) return `−${digits}`
  if (opts.sign && value > 0) return `+${digits}`
  return digits
}

const WEEKDAYS = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ']
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']

export function dayStamp(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${WEEKDAYS[date.getDay()]} ${dd}.${mm}`
}

export function monthName(date: Date): string {
  return MONTHS[date.getMonth()]
}

export function clock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
