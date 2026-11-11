import type { Kopecks } from './types'

/** «-284,97» → -28497. Принимает запятую или точку, пробелы и неразрывные пробелы. */
export function parseAmount(raw: string): Kopecks {
  const cleaned = raw.replace(/[\s  ]/g, '').replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) throw new Error(`Не сумма: «${raw}»`)
  const negative = cleaned.startsWith('-')
  const [whole, fraction = ''] = cleaned.replace('-', '').split('.')
  const kopecks = Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
  return negative ? -kopecks : kopecks
}

export function sum(values: Kopecks[]): Kopecks {
  return values.reduce((total, value) => total + value, 0)
}
