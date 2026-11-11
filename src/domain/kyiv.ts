/**
 * Киевское время без привязки к часовому поясу устройства или сервера.
 * Старая таблица хранит даты по Киеву, сервер Cloudflare живёт в UTC.
 */
const ZONE = 'Europe/Kiev'
const PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Unix-секунды → киевские дата и время. */
export function kyivParts(epoch: number): WallTime {
  const map: Record<string, number> = {}
  for (const part of PARTS.formatToParts(new Date(epoch * 1000))) if (part.type !== 'literal') map[part.type] = Number(part.value)
  return { year: map.year, month: map.month, day: map.day, hour: map.hour, minute: map.minute, second: map.second }
}

function offsetSeconds(epoch: number): number {
  const p = kyivParts(epoch)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - epoch
}

/** Киевские дата и время → unix-секунды. Месяц с единицы. */
export function kyivToEpoch(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second) / 1000
  const first = naive - offsetSeconds(naive)
  // Второй проход нужен рядом с переводом часов.
  return naive - offsetSeconds(first)
}

/** «08.11.2026 14:49» по Киеву → unix-секунды. */
export function sheetDateToEpoch(raw: string): number {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(raw.trim())
  if (!match) throw new Error(`Не дата: «${raw}»`)
  const [, dd, mm, yyyy, hh, min] = match
  return kyivToEpoch(Number(yyyy), Number(mm), Number(dd), Number(hh), Number(min))
}

/** Месяц по Киеву: «2026-11». */
export function kyivPeriod(epoch: number): string {
  const p = kyivParts(epoch)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

/**
 * Час, который в ночь перевода на зимнее время идёт дважды: запись «03:30» без секунд и пояса
 * может означать любой из двух моментов.
 */
export function isRepeatedHour(epoch: number): boolean {
  const same = (a: WallTime, b: WallTime) => a.day === b.day && a.hour === b.hour && a.minute === b.minute
  const here = kyivParts(epoch)
  return same(here, kyivParts(epoch + 3600)) || same(here, kyivParts(epoch - 3600))
}
