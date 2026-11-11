import { applyCounterpartyRule, classify } from './classify'
import { parseAmount } from './money'
import type { CounterpartyRule, Operation } from './types'

/** Разбор CSV с кавычками и переносами внутри полей. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** «08.11.2026 14:49» → Date (локальное время). */
export function parseSheetDate(raw: string): Date {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(raw.trim())
  if (!match) throw new Error(`Не дата: «${raw}»`)
  const [, dd, mm, yyyy, hh, min] = match
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min))
}

const COLUMNS = ['ID', 'Date and time', 'Description', 'MCC', 'Amount UAH', 'Account', 'Category', 'Subcategory', 'IsProject', 'IsTransfer']

/** Импорт листа Transactions из старой Google Таблицы. Дубли по ID отбрасываются. */
export function importSheet(text: string, counterparties: CounterpartyRule[] = []): Operation[] {
  const [header, ...rows] = parseCsv(text)
  const index = COLUMNS.map((name) => {
    const at = header.indexOf(name)
    if (at === -1) throw new Error(`В выгрузке нет колонки «${name}»`)
    return at
  })
  const seen = new Set<string>()
  const operations: Operation[] = []
  for (const row of rows) {
    const [id, date, description, mcc, amountRaw, account, category, subcategory, isProject, isTransfer] = index.map((at) => row[at] ?? '')
    if (seen.has(id)) continue
    seen.add(id)
    const amount = parseAmount(amountRaw)
    operations.push({
      id,
      at: parseSheetDate(date),
      description,
      mcc,
      amount,
      account,
      category,
      subcategory,
      kind: applyCounterpartyRule(
        classify({ description, mcc, amount, isProject: isProject === 'TRUE', isTransfer: isTransfer === 'TRUE' }),
        description,
        counterparties,
      ),
    })
  }
  return operations.sort((a, b) => b.at.getTime() - a.at.getTime())
}
