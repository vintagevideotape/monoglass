import { parseCsv } from './importSheet'
import { sheetDateToEpoch } from './kyiv'
import { parseAmount } from './money'

/** Строка листа Transactions в том виде, в каком её принимает сервер. */
export type LegacyRow = {
  id: string
  at: number
  description: string
  mcc: string
  amount: number
  account: string
  category: string
  subcategory: string
  isProject: boolean
  isTransfer: boolean
}

const COLUMNS = ['ID', 'Date and time', 'Description', 'MCC', 'Amount UAH', 'Account', 'Category', 'Subcategory', 'IsProject', 'IsTransfer']

/** Разбор выгрузки старой таблицы для переноса в базу. Время — по Киеву, дубли по ID отбрасываются. */
export function legacyRows(text: string): LegacyRow[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) throw new Error('Файл пуст')
  const index = COLUMNS.map((name) => {
    const at = header.indexOf(name)
    if (at === -1) throw new Error(`В выгрузке нет колонки «${name}»`)
    return at
  })
  const seen = new Set<string>()
  const out: LegacyRow[] = []
  for (const row of rows) {
    const [id, date, description, mcc, amount, account, category, subcategory, isProject, isTransfer] = index.map((at) => row[at] ?? '')
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    out.push({ id, at: sheetDateToEpoch(date), description, mcc, amount: parseAmount(amount), account, category, subcategory, isProject: isProject === 'TRUE', isTransfer: isTransfer === 'TRUE' })
  }
  return out
}
